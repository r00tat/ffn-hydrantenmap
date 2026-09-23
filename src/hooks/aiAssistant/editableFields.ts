export type FeldArt = 'text' | 'number' | 'flag' | 'time' | 'besatzung';

/**
 * Felder, die `updateItem` je Elementtyp ändern darf — die aus `fields()` der
 * Elementklassen, soweit sie sich sprechen lassen (keine Icon-URL, keine
 * Anhänge). Die Klassen selbst hängen an Leaflet und taugen im MCP-Server
 * nicht; die Liste steht deshalb hier und wird im Test gegen sie geprüft.
 * Name, Beschreibung, Farbe, Position und Drehung gelten für alle.
 */
export const EDITABLE_FIELDS: Record<string, Record<string, FeldArt>> = {
  vehicle: {
    fw: 'text',
    kategorie: 'text',
    besatzung: 'besatzung',
    ats: 'number',
    alarmierung: 'time',
    eintreffen: 'time',
    abruecken: 'time',
    fremd: 'flag',
  },
  tacticalUnit: {
    unitType: 'text',
    fw: 'text',
    mann: 'number',
    fuehrung: 'text',
    ats: 'number',
    alarmierung: 'time',
    eintreffen: 'time',
    abruecken: 'time',
  },
  rohr: { art: 'text', durchfluss: 'number' },
  marker: { zeichen: 'text', showLabel: 'flag' },
  circle: { radius: 'number', fill: 'flag', opacity: 'number' },
};
