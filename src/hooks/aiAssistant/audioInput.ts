/**
 * Kleinste Aufnahme, die noch einen gesprochenen Befehl enthalten kann.
 *
 * `useAudioRecorder` nimmt mit Opus in WebM auf; gemessen an echten Befehlen
 * sind das rund 23 KB je Sekunde. 4 KB entsprechen also etwa 0,2 Sekunden —
 * kürzer als jedes gesprochene Wort und deutlich mehr als der Containerkopf
 * allein, der beim versehentlichen Doppelklick auf den Aufnahmeknopf entsteht.
 */
export const MIN_AUDIO_BYTES = 4096;

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
