/**
 * Koordinaten in ebenen Gittern: UTM und das Bundesmeldenetz.
 *
 * Die beiden Schreibweisen aus [coordinates.ts](./coordinates.ts) sind Winkel;
 * diese hier sind Meter auf einer Abbildung. Gebraucht werden sie, weil die
 * Zahlen so bei uns ankommen: **UTM** steht auf der ÖK und ist, was Bundesheer
 * und viele Leitstellen sprechen, **BMN** ist das, was im Kataster, im
 * Burgenland-GIS und in unseren eigenen Hydrantendaten steht.
 *
 * | Kürzel | Beispiel                 |
 * | ------ | ------------------------ |
 * | `utm`  | `33T 637993 5312283`     |
 * | `bmn`  | `M34 787648 310270`      |
 *
 * Gerechnet wird mit proj4, das über das Höhenmodell ohnehin schon im Bundle
 * liegt. Auf Meter gerundet wird bewusst: Die Nachkommastelle eines
 * Gitterwerts ist Zentimeterarbeit und gehört nicht in eine Lage.
 */

import { CoordinatePair } from './coordinates';
import { EPSG_DEFINITIONS, proj4 } from './wgs-convert';

/** Die Meridianstreifen des Bundesmeldenetzes mit ihrem EPSG-Code. */
const BMN_ZONES = {
  28: 'EPSG:31257',
  31: 'EPSG:31258',
  34: 'EPSG:31259',
} as const;

/** Der Mittelmeridian je Streifen — 10°20', 13°20', 16°20'. */
const BMN_MERIDIAN: Record<BmnZone, number> = {
  28: 10 + 20 / 60,
  31: 13 + 20 / 60,
  34: 16 + 20 / 60,
};

export type BmnZone = keyof typeof BMN_ZONES;

/**
 * Die Bandbuchstaben der UTM-Zonen, 8° hoch, von 80° Süd an.
 *
 * `I` und `O` fehlen, weil sie sich von 1 und 0 nicht unterscheiden lassen;
 * `X` reicht ausnahmsweise bis 84° Nord.
 */
const BANDS = 'CDEFGHJKLMNPQRSTUVWX';

/** Die UTM-Zone: 6° breit, von 180° West an gezählt. */
export function utmZone(lng: number): number {
  return Math.floor((((lng + 180) % 360) + 360) % 360 / 6) + 1;
}

function utmBand(lat: number): string {
  const index = Math.floor((Math.min(Math.max(lat, -80), 83.9) + 80) / 8);
  return BANDS[Math.min(index, BANDS.length - 1)];
}

function utmDefinition(zone: number, south: boolean): string {
  return `+proj=utm +zone=${zone}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;
}

/**
 * Der Meridianstreifen zur Länge.
 *
 * Jeder Streifen reicht 1°30' beiderseits seines Mittelmeridians; die Grenzen
 * liegen damit bei 11°50' und 14°50'. Außerhalb Österreichs ergibt das keinen
 * Sinn mehr — dort bleibt es beim äußersten Streifen, und der Wert wird so
 * groß, dass er beim Zurücklesen ohnehin auffällt.
 */
export function bmnZone(lng: number): BmnZone {
  if (lng < 11.8333) return 28;
  if (lng < 14.8333) return 31;
  return 34;
}

function project(definition: string, lat: number, lng: number) {
  const [east, north] = proj4(definition, [lng, lat]) as unknown as [
    number,
    number,
  ];
  return { east, north };
}

function unproject(
  definition: string,
  east: number,
  north: number
): CoordinatePair | undefined {
  const [lng, lat] = proj4(definition, 'WGS84', [east, north]) as unknown as [
    number,
    number,
  ];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { lat, lng };
}

/** `33T 637993 5312283` */
export function formatUtm(lat: number, lng: number): string {
  const zone = utmZone(lng);
  const { east, north } = project(utmDefinition(zone, lat < 0), lat, lng);
  return `${zone}${utmBand(lat)} ${Math.round(east)} ${Math.round(north)}`;
}

/** `M34 787648 310270` */
export function formatBmn(lat: number, lng: number): string {
  const zone = bmnZone(lng);
  const { east, north } = project(EPSG_DEFINITIONS[BMN_ZONES[zone]], lat, lng);
  return `M${zone} ${Math.round(east)} ${Math.round(north)}`;
}

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const UTM = new RegExp(
  String.raw`^(?:(\d{1,2}) ?([A-Z])? )?(${NUMBER}) (${NUMBER})$`,
  'i'
);
const BMN = new RegExp(
  String.raw`^(?:M ?(28|31|34) )?(?:R ?)?(${NUMBER}) (?:H ?)?(${NUMBER})$`,
  'i'
);

function tidy(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function toNumber(raw: string): number {
  return Number.parseFloat(raw.replace(',', '.'));
}

/**
 * Eine UTM-Angabe lesen.
 *
 * Der Buchstabe hinter der Zone darf das Band sein (`33T`) oder die Halbkugel
 * (`33N`) — beides kommt vor, und für die Rechnung zählt nur, auf welcher
 * Seite des Äquators es liegt: `A` bis `M` südlich, `N` bis `Z` nördlich.
 * Das MGRS-Quadrat (`33T XP 12345 67890`) ist eine andere Schreibweise und
 * wird hier **nicht** gelesen.
 *
 * @param defaultZone die Zone, die gilt, wenn keine dabeisteht — beim Ändern
 *   der Zahlen im Feld bleibt so die Zone, die dort schon stand.
 */
export function parseUtm(
  input: string,
  defaultZone?: number
): CoordinatePair | undefined {
  const match = UTM.exec(tidy(input));
  if (!match) return undefined;
  const [, rawZone, band, rawEast, rawNorth] = match;

  const zone = rawZone ? Number.parseInt(rawZone, 10) : defaultZone;
  if (!zone || zone < 1 || zone > 60) return undefined;

  const south = band ? band.toUpperCase() < 'N' : false;
  return unproject(
    utmDefinition(zone, south),
    toNumber(rawEast),
    toNumber(rawNorth)
  );
}

/**
 * Eine BMN-Angabe lesen.
 *
 * Steht der Streifen nicht dabei, verrät ihn der Rechtswert: Die falschen
 * Rechtswerte 150/450/750 km liegen weit genug auseinander, dass keine Angabe
 * aus Österreich in zwei Streifen passt.
 */
export function parseBmn(input: string): CoordinatePair | undefined {
  const match = BMN.exec(tidy(input));
  if (!match) return undefined;
  const [, rawZone, rawEast, rawNorth] = match;

  const east = toNumber(rawEast);
  const north = toNumber(rawNorth);
  const zone: BmnZone = rawZone
    ? (Number.parseInt(rawZone, 10) as BmnZone)
    : east < 300000
      ? 28
      : east < 600000
        ? 31
        : 34;

  const pair = unproject(EPSG_DEFINITIONS[BMN_ZONES[zone]], east, north);
  if (!pair) return undefined;

  // Eine BMN-Angabe liegt in ihrem Streifen. Ohne diese Probe wird aus einem
  // UTM-Paar, das versehentlich in dieses Feld geraten ist, klaglos ein Punkt
  // irgendwo auf der Welt — die Rechnung geht ja auf, nur die Zahlen gehören
  // nicht hierher. Drei Grad statt der nominellen anderthalb: An den
  // Streifengrenzen wird der Nachbarstreifen durchaus weitergeführt.
  if (Math.abs(pair.lng - BMN_MERIDIAN[zone]) > 3) return undefined;
  return pair;
}
