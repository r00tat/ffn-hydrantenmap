/**
 * Aus einem `GetCapabilities` die Einstellungen einer Kartenebene ableiten.
 *
 * Der Dienst weiß fast alles, was der Dialog abfragt: wie der Layer heißt, was
 * er zeigt, wem er gehört, welche Formate er liefert, wie weit man
 * hineinzoomen darf und welchen Ausschnitt er abdeckt. Von Hand eingetragen
 * wird davon erfahrungsgemäß nichts — also wird es übernommen.
 *
 * Reine Funktionen, damit die Ableitung ohne Netz und ohne DOM prüfbar ist.
 */

import {
  parseMapLayerBounds,
  sanitizeAttribution,
  type FirecallMapLayer,
} from './mapLayers';
import type { WmsCapabilities, WmsCapabilitiesLayer } from './wmsCapabilities';

/**
 * Das Koordinatensystem, das Leaflet anfragt.
 *
 * `L.TileLayer.WMS` schickt `SRS`/`CRS=EPSG:3857`. Ein Dienst, der das nicht
 * führt, liefert eine Fehlermeldung statt einer Kachel — und zwar still, weil
 * das Bild einfach nicht kommt. Deshalb wird davor gewarnt, statt es
 * herauszufinden, wenn die Karte im Einsatz leer bleibt.
 */
export const LEAFLET_CRS = 'EPSG:3857';

/** Die veraltete Schreibweise desselben Systems; viele Dienste führen nur sie. */
const LEAFLET_CRS_ALIASES = [LEAFLET_CRS, 'EPSG:900913', 'EPSG:102100'];

/** Führt der Layer ein Koordinatensystem, mit dem Leaflet etwas anfangen kann? */
export function supportsLeafletCrs(layer: WmsCapabilitiesLayer): boolean {
  // Ein Dienst, der gar nichts meldet, wird nicht verdächtigt: die Angabe ist
  // vererbbar und fehlt in der Praxis oft ganz.
  if (layer.crs.length === 0) return true;
  return layer.crs.some((crs) =>
    LEAFLET_CRS_ALIASES.includes(crs.trim().toUpperCase())
  );
}

/** Das umschließende Rechteck mehrerer Ausdehnungen, in unserer Reihenfolge. */
export function unionBounds(values: (string | undefined)[]): string | undefined {
  const boxes = values
    .map((value) => parseMapLayerBounds(value))
    .filter((box): box is [[number, number], [number, number]] => !!box);
  if (boxes.length === 0) return undefined;

  const south = Math.min(...boxes.map((b) => b[0][0]));
  const west = Math.min(...boxes.map((b) => b[0][1]));
  const north = Math.max(...boxes.map((b) => b[1][0]));
  const east = Math.max(...boxes.map((b) => b[1][1]));
  return `${south},${west},${north},${east}`;
}

/**
 * Das beste Format, das der Dienst anbietet.
 *
 * PNG kann Transparenz, JPEG nicht — für eine Überlagerung ist das der
 * Unterschied zwischen „liegt über der Basiskarte" und „verdeckt sie".
 * Umgekehrt ist JPEG für ein flächendeckendes Luftbild die deutlich kleinere
 * Kachel; meldet der Dienst den Layer als `opaque`, gewinnt es.
 */
export function preferredFormat(
  formats: string[],
  opaque = false
): string | undefined {
  const available = formats.map((f) => f.trim().toLowerCase());
  const order = opaque
    ? ['image/jpeg', 'image/png']
    : ['image/png', 'image/jpeg'];
  for (const candidate of order) {
    if (available.includes(candidate)) return candidate;
  }
  // Ein Dienst, der weder PNG noch JPEG führt (etwa nur `image/png; mode=8bit`),
  // bekommt seinen ersten Vorschlag — er weiß es besser als eine Vorbelegung.
  return available[0];
}

/** Die Felder, die aus dem Dienst kommen. */
export type DerivedMapLayerSettings = Pick<
  FirecallMapLayer,
  | 'name'
  | 'beschreibung'
  | 'wmsLayers'
  | 'format'
  | 'transparent'
  | 'bounds'
  | 'maxNativeZoom'
  | 'attribution'
>;

export interface DeriveResult {
  settings: DerivedMapLayerSettings;
  /** Layer ohne brauchbares Koordinatensystem — die Karte bliebe leer. */
  unsupportedCrs: string[];
}

/**
 * Die Einstellungen zu den ausgewählten Layern eines Dienstes.
 *
 * Bei mehreren Layern in einer Anfrage gilt:
 * - **Ausdehnung**: die Vereinigung, sonst schnitte der engste Layer die
 *   anderen weg.
 * - **Zoomgrenze**: die kleinste, sonst liefert der empfindlichste Layer in den
 *   feinsten Stufen nichts mehr.
 * - **Name, Beschreibung, Quellenangabe**: vom ersten Layer; bei mehreren
 *   ergäbe alles andere einen Textklumpen.
 */
export function deriveMapLayerSettings(
  selected: WmsCapabilitiesLayer[],
  capabilities: Pick<WmsCapabilities, 'formats' | 'title'>
): DeriveResult {
  const settings: DerivedMapLayerSettings = {
    name: '',
    wmsLayers: selected.map((layer) => layer.name).join(','),
  };

  if (selected.length === 0) {
    return { settings: { name: '', wmsLayers: '' }, unsupportedCrs: [] };
  }

  const [first] = selected;
  settings.name =
    selected.length === 1 ? first.title || first.name : capabilities.title || '';

  if (selected.length === 1 && first.abstract) {
    settings.beschreibung = first.abstract;
  }

  const opaque = selected.every((layer) => layer.opaque === true);
  const format = preferredFormat(capabilities.formats, opaque);
  if (format) settings.format = format;
  // Ein flächendeckender Layer braucht keine Transparenz — und JPEG kann sie
  // ohnehin nicht.
  settings.transparent = !opaque && format !== 'image/jpeg';

  const bounds = unionBounds(selected.map((layer) => layer.bounds));
  if (bounds) settings.bounds = bounds;

  const zooms = selected
    .map((layer) => layer.maxNativeZoom)
    .filter((zoom): zoom is number => zoom !== undefined);
  if (zooms.length === selected.length && zooms.length > 0) {
    settings.maxNativeZoom = Math.min(...zooms);
  }

  const attribution = sanitizeAttribution(first.attribution);
  if (attribution) settings.attribution = attribution;

  return {
    settings,
    unsupportedCrs: selected
      .filter((layer) => !supportsLeafletCrs(layer))
      .map((layer) => layer.title || layer.name),
  };
}
