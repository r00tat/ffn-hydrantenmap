/**
 * Mikrofon und Wiedergabe für die Live-Sitzung.
 *
 * Warum nicht `startAudioConversation` aus dem Firebase-SDK: Das schaltet
 * Mikrofon, Nachrichtenschleife und Wiedergabe gemeinsam ein und wieder aus.
 * Sein `stop()` räumt beim Beenden auch die geplante Wiedergabe ab
 * (`cleanup()` → `interruptPlayback()`) — beim Sprechtaste-Loslassen wäre
 * damit genau die Antwort weg, auf die der Benutzer wartet. Hier sind Aufnahme
 * und Wiedergabe deshalb zwei getrennte Einheiten mit eigenem `AudioContext`:
 * Das Mikrofon endet beim Loslassen, die Wiedergabe läuft weiter, bis sie
 * leer ist.
 */

/** Abtastrate, die die Live-API für den Eingang erwartet. */
const INPUT_SAMPLE_RATE = 16000;
/** Abtastrate, mit der die Live-API den Ton ausliefert. */
const OUTPUT_SAMPLE_RATE = 24000;

const PROCESSOR_NAME = 'ffnd-live-audio-processor';

/**
 * Wie viel Ton in einer Nachricht zusammengefasst wird.
 *
 * Ein `process()`-Aufruf liefert 128 Bilder; bei 48 kHz sind das 2,7 ms und
 * nach der Umrechnung auf 16 kHz rund 85 Byte. Jeder Block einzeln verschickt
 * ergab in einer gemessenen Sitzung **3752 WebSocket-Nachrichten für zehn
 * Sekunden** — 375 pro Sekunde, jede mit JSON- und base64-Aufschlag um ein
 * Vielfaches größer als ihre Nutzlast. Im Gespräch läuft das durchgehend.
 * 100 ms ist die Blockgröße, mit der die Live-API in ihren eigenen Beispielen
 * gefüttert wird, und liegt weit unter allem, was man als Verzögerung merkt.
 */
const CHUNK_MS = 100;

/**
 * Wandelt die Blöcke des Mikrofons in 16-bit-PCM der Zielrate und sammelt sie
 * zu Paketen von `CHUNK_MS`. Läuft im Audio-Thread, weil der Hauptthread beim
 * Rendern der Karte ins Stocken gerät und Aussetzer im Ton hörbar wären.
 */
const workletSource = `
  class LiveAudioProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this.targetSampleRate = options.processorOptions.targetSampleRate;
      this.inputSampleRate = sampleRate;
      this.buffer = new Int16Array(
        Math.round((this.targetSampleRate * options.processorOptions.chunkMs) / 1000)
      );
      this.filled = 0;
    }

    process(inputs) {
      const input = inputs[0];
      if (input && input.length > 0 && input[0].length > 0) {
        const samples = input[0];
        const length = Math.round((samples.length * this.targetSampleRate) / this.inputSampleRate);
        const ratio = samples.length / length;
        for (let i = 0; i < length; i++) {
          const sample = Math.max(-1, Math.min(1, samples[Math.floor(i * ratio)]));
          this.buffer[this.filled++] = sample < 0 ? sample * 32768 : sample * 32767;
          if (this.filled === this.buffer.length) {
            // Eine Kopie, weil der Puffer sofort weiterbeschrieben wird.
            this.port.postMessage(this.buffer.slice());
            this.filled = 0;
          }
        }
      }
      return true;
    }
  }

  registerProcessor('${PROCESSOR_NAME}', LiveAudioProcessor);
`;

function toBase64(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export interface MicrophoneCapture {
  /** Mikrofon abschalten und Geräte freigeben. Die Wiedergabe bleibt davon unberührt. */
  stop: () => Promise<void>;
}

/** Ist die Live-Aufnahme in dieser Umgebung überhaupt möglich? */
export function isLiveAudioSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof AudioWorkletNode !== 'undefined' &&
    typeof AudioContext !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices
  );
}

/**
 * Nimmt auf und reicht jeden Block als base64-PCM weiter. Muss aus einer
 * Benutzeraktion heraus aufgerufen werden, sonst bleibt der `AudioContext`
 * nach den Autoplay-Regeln der Browser stumm.
 */
export async function startMicrophoneCapture(
  onChunk: (base64Pcm: string) => void
): Promise<MicrophoneCapture> {
  const audioContext = new AudioContext();
  let mediaStream: MediaStream | undefined;

  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const workletUrl = URL.createObjectURL(
      new Blob([workletSource], { type: 'application/javascript' })
    );
    try {
      await audioContext.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }

    const sourceNode = audioContext.createMediaStreamSource(mediaStream);
    const workletNode = new AudioWorkletNode(audioContext, PROCESSOR_NAME, {
      processorOptions: { targetSampleRate: INPUT_SAMPLE_RATE, chunkMs: CHUNK_MS },
    });
    sourceNode.connect(workletNode);

    let stopped = false;
    workletNode.port.onmessage = (event: MessageEvent<Int16Array>) => {
      if (stopped) return;
      onChunk(toBase64(event.data.buffer));
    };

    return {
      stop: async () => {
        if (stopped) return;
        stopped = true;
        workletNode.port.onmessage = null;
        workletNode.disconnect();
        sourceNode.disconnect();
        mediaStream?.getTracks().forEach((track) => track.stop());
        if (audioContext.state !== 'closed') {
          await audioContext.close();
        }
      },
    };
  } catch (error) {
    mediaStream?.getTracks().forEach((track) => track.stop());
    if (audioContext.state !== 'closed') {
      void audioContext.close();
    }
    throw error;
  }
}

/**
 * Spielt die PCM-Blöcke des Modells lückenlos hintereinander ab.
 *
 * Jeder Block wird auf der Zeitachse des `AudioContext` an das Ende des
 * vorigen gehängt. Das ist der Grund für die eigene Buchführung: Ein
 * `start()` ohne Zeitpunkt würde jeden Block sofort abspielen und die Sätze
 * übereinanderlegen.
 */
export class LivePlayback {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  /**
   * Legt den `AudioContext` an und weckt ihn — **aus der Benutzeraktion
   * heraus**, also beim Drücken der Sprechtaste.
   *
   * Warum das nicht warten kann, bis der erste Ton da ist: Der erste Ton
   * kommt Sekunden nach dem Tastendruck, und ein dann angelegter Kontext
   * startet nach den Autoplay-Regeln `suspended`. Seine Uhr steht dann bei
   * 0 und läuft nicht, `start()` reiht zwar ein, aber es erklingt nichts.
   * Die Aufnahme kennt diese Regel längst (siehe `startMicrophoneCapture`);
   * die Wiedergabe kannte sie nicht.
   *
   * Der Fehler war besonders unangenehm, weil er still war: Ton **kam** an,
   * also galt die Antwort als gesprochen (`spokenByModel`), und damit
   * unterblieb auch die Sprachausgabe des Browsers als zweiter Weg.
   */
  prime(): void {
    void this.ensureContext();
  }

  enqueue(base64Pcm: string): void {
    const context = this.ensureContext();
    const bytes = Uint8Array.from(atob(base64Pcm), (character) => character.charCodeAt(0));
    const pcm16 = new Int16Array(bytes.buffer);
    if (pcm16.length === 0) return;

    const buffer = context.createBuffer(1, pcm16.length, OUTPUT_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm16.length; i++) {
      channel[i] = pcm16[i] / 32768;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
    };

    this.nextStartTime = Math.max(context.currentTime, this.nextStartTime);
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
  }

  /** Alles Geplante verwerfen — das Modell wurde unterbrochen. */
  interrupt(): void {
    this.sources.forEach((source) => source.stop(0));
    this.sources.clear();
    this.nextStartTime = this.audioContext?.currentTime ?? 0;
  }

  /** Wartet, bis der zuletzt eingereihte Block zu Ende gespielt ist. */
  async whenDrained(): Promise<void> {
    const context = this.audioContext;
    if (!context) return;
    const remainingMs = Math.max(0, (this.nextStartTime - context.currentTime) * 1000);
    if (remainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingMs));
    }
  }

  async close(): Promise<void> {
    const context = this.audioContext;
    this.audioContext = null;
    this.sources.clear();
    this.nextStartTime = 0;
    if (context && context.state !== 'closed') {
      await context.close();
    }
  }

  private ensureContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
      this.nextStartTime = 0;
    }
    // Auch außerhalb von `prime()`: Ein Kontext kann zwischendurch wieder
    // einschlafen, etwa wenn der Bildschirm sperrt. Das Ergebnis wird nicht
    // abgewartet — `enqueue` plant ohnehin in die Zukunft, und ein Warten
    // hier würde die Reihenfolge der Blöcke gefährden.
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume().catch(() => undefined);
    }
    return this.audioContext;
  }
}
