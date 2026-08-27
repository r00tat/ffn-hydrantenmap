import { GeoPositionObject } from '../common/geo';

// Feuerwehrhaus Neusiedl am See
export const defaultPosition: GeoPositionObject = {
  lat: 47.9482913,
  lng: 16.848222,
};

/**
 * Aufnahmequalität für Sprachbefehle.
 *
 * Ohne Vorgabe nimmt der Browser mit rund 156 kbit/s auf (aus der Messung zu
 * #740: 205 KB für gut zehn Sekunden). Für Sprache ist das etwa das Fünffache
 * des Nötigen — Opus liefert bei 32 kbit/s verständliche Aufnahmen. Der
 * kleinere Upload zählt nicht im WLAN, sondern am Einsatzort im Mobilfunknetz,
 * wo die App laufen muss.
 *
 * Wer diesen Wert ändert, ändert auch die kleinste brauchbare Aufnahme —
 * `MIN_AUDIO_BYTES` in `aiAssistant/audioInput.ts` rechnet damit.
 */
export const AUDIO_BITS_PER_SECOND = 32000;
