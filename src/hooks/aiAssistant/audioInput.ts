import { AUDIO_BITS_PER_SECOND } from '../constants';

/** Kürzestes Wort, das noch ein Befehl sein könnte („ja", „stopp"). */
const MIN_AUDIO_SECONDS = 0.25;

/**
 * Kleinste Aufnahme, die noch einen gesprochenen Befehl enthalten kann.
 *
 * Abgeleitet aus der Aufnahmebitrate, damit beides nicht auseinanderläuft: Bei
 * 32 kbit/s sind das 1000 Byte. Ein WebM-Containerkopf ohne Tonspur — das
 * Ergebnis eines Fehlgriffs am Aufnahmeknopf — bleibt darunter, eine echte
 * Viertelsekunde Sprache liegt mit dem Kopf zusammen darüber.
 */
export const MIN_AUDIO_BYTES = Math.round((AUDIO_BITS_PER_SECOND / 8) * MIN_AUDIO_SECONDS);

/**
 * Enthält die Aufnahme genug, um sie an das Modell zu schicken?
 *
 * Eine Aufnahme ohne Tonspur beantwortet Gemini mit „400 Request contains an
 * invalid argument" — ein Fehler in der Konsole, eine Sekunde Wartezeit und
 * eine Meldung, die dem Benutzer nicht sagt, was er anders machen soll.
 */
export function isUsableAudio(audioBase64: string): boolean {
  // Base64 kodiert drei Byte in vier Zeichen.
  return Math.floor((audioBase64.length * 3) / 4) >= MIN_AUDIO_BYTES;
}
