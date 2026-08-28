/**
 * Auswertung eines WMS-`GetCapabilities`-Dokuments.
 *
 * Zweck ist allein die Anlage einer eigenen Kartenebene: aus dem Dokument
 * werden die wählbaren Layer, ihre Titel, ihre Ausdehnung und die vom Dienst
 * angebotenen Bildformate gelesen. Alles andere — Styles, Maßstabsgrenzen,
 * Dimensionen — bleibt liegen.
 *
 * Geparst wird mit einem eigenen, sehr kleinen XML-Leser statt mit `DOMParser`:
 * das Dokument kommt über eine Server Action herein (die Dienste setzen kein
 * CORS), und auf dem Server gibt es keinen `DOMParser`. Ein Parser, der auf
 * beiden Seiten läuft, lässt sich außerdem ohne jsdom testen.
 */

export interface XmlNode {
  /** Tagname ohne Namensraum-Präfix. */
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const TAG_RE = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^<>]*?)?)(\/?)>/g;

function localName(name: string): string {
  const colon = name.indexOf(':');
  return colon < 0 ? name : name.slice(colon + 1);
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const re = /([A-Za-z_][\w.:-]*)\s*=\s*"([^"]*)"|([A-Za-z_][\w.:-]*)\s*=\s*'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const key = localName(match[1] ?? match[3]);
    attributes[key] = decodeEntities(match[2] ?? match[4] ?? '');
  }
  return attributes;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/&amp;/g, '&');
}

/**
 * Kommentare, Verarbeitungsanweisungen und DOCTYPE entfernen, CDATA-Inhalte
 * als Text stehen lassen. Ohne das würde `<!-- <Layer> -->` einen Layer
 * vortäuschen.
 */
function stripNonElements(xml: string): string {
  return xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?[^>]*>/gi, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, content: string) =>
      content.replace(/[<>&]/g, ' ')
    );
}

/** Ein XML-Dokument als Baum. Ungültiges XML ergibt einen leeren Wurzelknoten. */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = {
    name: '#document',
    attributes: {},
    children: [],
    text: '',
  };
  const source = stripNonElements(xml);
  const stack: XmlNode[] = [root];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(source)) !== null) {
    const [full, closing, rawName, rawAttributes, selfClosing] = match;
    const current = stack[stack.length - 1];
    const text = source.slice(lastIndex, match.index);
    if (text.trim()) current.text += decodeEntities(text);
    lastIndex = match.index + full.length;

    const name = localName(rawName);
    if (closing) {
      // Ein unpassendes Ende-Tag wird übergangen, statt den Baum zu verwerfen.
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const node: XmlNode = {
      name,
      attributes: parseAttributes(rawAttributes ?? ''),
      children: [],
      text: '',
    };
    current.children.push(node);
    if (!selfClosing) stack.push(node);
  }

  return root;
}

/** Direkte Kindknoten mit diesem Namen. */
export function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((child) => child.name === name);
}

/** Erster direkter Kindknoten mit diesem Namen. */
export function childNamed(
  node: XmlNode,
  name: string
): XmlNode | undefined {
  return node.children.find((child) => child.name === name);
}

/** Text des ersten direkten Kindknotens mit diesem Namen. */
export function childText(node: XmlNode, name: string): string | undefined {
  const child = childNamed(node, name);
  const text = child?.text.trim();
  return text ? text : undefined;
}

/** Erster Knoten mit diesem Namen, egal wie tief. */
function findDeep(node: XmlNode, name: string): XmlNode | undefined {
  for (const child of node.children) {
    if (child.name === name) return child;
    const found = findDeep(child, name);
    if (found) return found;
  }
  return undefined;
}

export interface WmsCapabilitiesLayer {
  /** Wert für den `LAYERS`-Parameter. */
  name: string;
  title: string;
  /** `<Abstract>` — die Beschreibung des Dienstes zu diesem Layer. */
  abstract?: string;
  /** `süd,west,nord,ost`, falls der Dienst eine Ausdehnung meldet. */
  bounds?: string;
  /** Quellenangabe aus `<Attribution><Title>`, vererbt. */
  attribution?: string;
  /** Die gemeldeten Koordinatensysteme (`CRS` bzw. `SRS`), vererbt. */
  crs: string[];
  /**
   * `opaque="1"`: der Dienst sagt, dass der Layer flächendeckend deckt.
   * Transparenz anzufordern kostet dann nur Bandbreite.
   */
  opaque?: boolean;
  /** Feinste sinnvolle Zoomstufe, aus der Maßstabsgrenze abgeleitet. */
  maxNativeZoom?: number;
  /** Verschachtelungstiefe — zur Einrückung in der Auswahl. */
  depth: number;
}

export interface WmsCapabilities {
  title?: string;
  abstract?: string;
  version?: string;
  /** Vom Dienst angebotene Bildformate für `GetMap`. */
  formats: string[];
  layers: WmsCapabilitiesLayer[];
}

/**
 * Der Maßstabsnenner der Zoomstufe 0 in EPSG:3857.
 *
 * 156543,034 m je Pixel am Äquator, geteilt durch die von der OGC
 * festgelegte Pixelgröße von 0,28 mm. Jede Stufe halbiert den Wert.
 */
const SCALE_DENOMINATOR_ZOOM_0 = 559_082_264.028_717_8;

/** Auflösung der Zoomstufe 0 in EPSG:3857, in Metern je Pixel. */
const RESOLUTION_ZOOM_0 = 156_543.033_928_040_97;

/** Weiter als hierhin lässt keine Kachelebene sinnvoll hineinzoomen. */
const MAX_DERIVABLE_ZOOM = 22;

/**
 * Zugeständnis an die Rundung der Dienste.
 *
 * Abgerundet wird, weil eine zu hoch angesetzte Stufe leere Kacheln bedeutet,
 * eine zu niedrige nur hochskalierte. Die Dienste veröffentlichen ihre Grenzen
 * aber gerundet: ein `ScaleHint` von `0.4223` ergibt 18,99986 und fiele damit
 * auf 18, obwohl Stufe 19 gemeint ist. Ein Zehntel Toleranz fängt das ab, ohne
 * einen echten Zwischenwert wie 18,5 hochzuziehen.
 */
const ZOOM_ROUNDING_TOLERANCE = 0.1;

function clampZoom(zoom: number): number | undefined {
  if (!Number.isFinite(zoom)) return undefined;
  const rounded = Math.floor(zoom + ZOOM_ROUNDING_TOLERANCE);
  if (rounded < 0) return 0;
  if (rounded > MAX_DERIVABLE_ZOOM) return undefined;
  return rounded;
}

/**
 * Die Zoomstufe zu einem Maßstabsnenner (WMS 1.3.0,
 * `<MinScaleDenominator>`).
 *
 * **Die Grenze heißt `Min`, meint aber die feinste Stufe.** Ein Layer ist
 * sichtbar, solange der Maßstab zwischen `MinScaleDenominator` und
 * `MaxScaleDenominator` liegt; der kleinere Nenner ist der größere Maßstab,
 * also das weitere Hineinzoomen. Aus `Min` wird daher `maxNativeZoom`.
 */
export function zoomFromScaleDenominator(
  denominator: number
): number | undefined {
  if (!Number.isFinite(denominator) || denominator <= 0) return undefined;
  return clampZoom(Math.log2(SCALE_DENOMINATOR_ZOOM_0 / denominator));
}

/**
 * Die Zoomstufe zu einem `<ScaleHint min>` (WMS 1.1.1).
 *
 * `ScaleHint` ist kein Nenner, sondern die **Diagonale** eines Pixels in
 * Bodenmetern — deshalb der Faktor √2 zur Auflösung. Ein Wert von 0 heißt
 * „keine Grenze".
 */
export function zoomFromScaleHint(hint: number): number | undefined {
  if (!Number.isFinite(hint) || hint <= 0) return undefined;
  const resolution = hint / Math.SQRT2;
  return clampZoom(Math.log2(RESOLUTION_ZOOM_0 / resolution));
}

function boundsOf(layer: XmlNode): string | undefined {
  // WMS 1.3.0
  const geo = childNamed(layer, 'EX_GeographicBoundingBox');
  if (geo) {
    const west = Number(childText(geo, 'westBoundLongitude'));
    const east = Number(childText(geo, 'eastBoundLongitude'));
    const south = Number(childText(geo, 'southBoundLatitude'));
    const north = Number(childText(geo, 'northBoundLatitude'));
    if ([west, east, south, north].every((n) => Number.isFinite(n))) {
      return `${south},${west},${north},${east}`;
    }
  }

  // WMS 1.1.1
  const latLon = childNamed(layer, 'LatLonBoundingBox');
  if (latLon) {
    const west = Number(latLon.attributes.minx);
    const south = Number(latLon.attributes.miny);
    const east = Number(latLon.attributes.maxx);
    const north = Number(latLon.attributes.maxy);
    if ([west, east, south, north].every((n) => Number.isFinite(n))) {
      return `${south},${west},${north},${east}`;
    }
  }

  return undefined;
}

/** Die Quellenangabe eines Layers — `<Attribution><Title>`. */
function attributionOf(layer: XmlNode): string | undefined {
  const attribution = childNamed(layer, 'Attribution');
  return attribution ? childText(attribution, 'Title') : undefined;
}

/**
 * Die feinste Zoomstufe, die der Dienst für den Layer zulässt.
 *
 * 1.3.0 nennt `<MinScaleDenominator>`, 1.1.1 `<ScaleHint min>`. Beide meinen
 * dasselbe Ende: so weit darf hineingezoomt werden. Fehlt die Angabe, gibt es
 * keine Grenze — dann bleibt `maxNativeZoom` die Vorbelegung.
 */
function maxNativeZoomOf(layer: XmlNode): number | undefined {
  const denominator = childText(layer, 'MinScaleDenominator');
  if (denominator !== undefined) {
    return zoomFromScaleDenominator(Number(denominator));
  }
  const hint = childNamed(layer, 'ScaleHint');
  if (hint) return zoomFromScaleHint(Number(hint.attributes.min));
  return undefined;
}

/**
 * Alle benannten Layer eines Capabilities-Dokuments.
 *
 * Layer sind verschachtelt: der äußere Layer ist meist nur eine Überschrift
 * ohne `<Name>` und damit nicht anforderbar. Ausdehnung, Quellenangabe,
 * Koordinatensysteme und Maßstabsgrenzen werden nach innen vererbt, so wie es
 * die WMS-Spezifikation vorsieht.
 */
export function parseWmsCapabilities(xml: string): WmsCapabilities {
  const document = parseXml(xml);
  const root =
    findDeep(document, 'WMS_Capabilities') ??
    findDeep(document, 'WMT_MS_Capabilities') ??
    document;

  const service = childNamed(root, 'Service');
  const capability = childNamed(root, 'Capability');

  const getMap = capability
    ? childNamed(childNamed(capability, 'Request') ?? capability, 'GetMap')
    : undefined;
  const formats = getMap
    ? childrenNamed(getMap, 'Format')
        .map((node) => node.text.trim())
        .filter(Boolean)
    : [];

  /** Was der Dienst insgesamt sagt, gilt auch für den einzelnen Layer. */
  const serviceAttribution = service ? attributionOf(service) : undefined;

  interface Inherited {
    bounds?: string;
    attribution?: string;
    crs: string[];
    maxNativeZoom?: number;
  }

  const layers: WmsCapabilitiesLayer[] = [];
  const walk = (node: XmlNode, depth: number, inherited: Inherited): void => {
    for (const layer of childrenNamed(node, 'Layer')) {
      // 1.3.0 schreibt `CRS`, 1.1.1 `SRS`. Beide können mehrfach auftreten,
      // und 1.1.1 packt gelegentlich mehrere durch Leerzeichen getrennt in
      // dasselbe Element.
      const own = [
        ...childrenNamed(layer, 'CRS'),
        ...childrenNamed(layer, 'SRS'),
      ]
        .flatMap((node) => node.text.trim().split(/\s+/))
        .filter(Boolean);

      const current: Inherited = {
        bounds: boundsOf(layer) ?? inherited.bounds,
        attribution: attributionOf(layer) ?? inherited.attribution,
        crs: [...new Set([...inherited.crs, ...own])],
        maxNativeZoom: maxNativeZoomOf(layer) ?? inherited.maxNativeZoom,
      };

      const name = childText(layer, 'Name');
      if (name) {
        layers.push({
          name,
          title: childText(layer, 'Title') ?? name,
          ...(childText(layer, 'Abstract')
            ? { abstract: childText(layer, 'Abstract') }
            : {}),
          ...(current.bounds ? { bounds: current.bounds } : {}),
          ...(current.attribution ? { attribution: current.attribution } : {}),
          crs: current.crs,
          ...(layer.attributes.opaque === '1' ? { opaque: true } : {}),
          ...(current.maxNativeZoom !== undefined
            ? { maxNativeZoom: current.maxNativeZoom }
            : {}),
          depth,
        });
      }
      walk(layer, depth + (name ? 1 : 0), current);
    }
  };
  if (capability) {
    walk(capability, 0, {
      crs: [],
      ...(serviceAttribution ? { attribution: serviceAttribution } : {}),
    });
  }

  return {
    ...(service && childText(service, 'Title')
      ? { title: childText(service, 'Title') }
      : {}),
    ...(service && childText(service, 'Abstract')
      ? { abstract: childText(service, 'Abstract') }
      : {}),
    ...(root.attributes.version ? { version: root.attributes.version } : {}),
    formats,
    layers,
  };
}

/**
 * Die `GetCapabilities`-Adresse zu einer eingegebenen Dienst-URL.
 *
 * Vorhandene Parameter bleiben stehen — manche Dienste unterscheiden ihre
 * Instanzen darüber —, `SERVICE`, `REQUEST` und `VERSION` werden gesetzt.
 */
export function capabilitiesUrl(serviceUrl: string, version = '1.3.0'): string {
  const url = new URL(serviceUrl);
  const params = url.searchParams;
  for (const key of [...params.keys()]) {
    if (['service', 'request', 'version'].includes(key.toLowerCase())) {
      params.delete(key);
    }
  }
  params.set('SERVICE', 'WMS');
  params.set('REQUEST', 'GetCapabilities');
  params.set('VERSION', version);
  url.search = params.toString();
  return url.toString();
}

/**
 * Die reine Dienst-URL ohne die Parameter, die Leaflet selbst setzt.
 *
 * Wer eine GetCapabilities-URL einfügt, soll nicht daran scheitern, dass
 * `REQUEST=GetCapabilities` in der gespeicherten Ebene stehen bleibt und jede
 * Kachelanfrage das Capabilities-Dokument statt eines Bildes zurückbekommt.
 */
export function stripWmsRequestParams(serviceUrl: string): string {
  const url = new URL(serviceUrl);
  const params = url.searchParams;
  const drop = [
    'service',
    'request',
    'version',
    'layers',
    'format',
    'transparent',
    'styles',
    'srs',
    'crs',
    'bbox',
    'width',
    'height',
  ];
  for (const key of [...params.keys()]) {
    if (drop.includes(key.toLowerCase())) params.delete(key);
  }
  url.search = params.toString();
  return url.search ? `${url.toString()}&` : `${url.toString()}?`;
}
