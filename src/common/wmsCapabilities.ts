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
  /** `süd,west,nord,ost`, falls der Dienst eine Ausdehnung meldet. */
  bounds?: string;
  /** Verschachtelungstiefe — zur Einrückung in der Auswahl. */
  depth: number;
}

export interface WmsCapabilities {
  title?: string;
  version?: string;
  /** Vom Dienst angebotene Bildformate für `GetMap`. */
  formats: string[];
  layers: WmsCapabilitiesLayer[];
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

/**
 * Alle benannten Layer eines Capabilities-Dokuments.
 *
 * Layer sind verschachtelt: der äußere Layer ist meist nur eine Überschrift
 * ohne `<Name>` und damit nicht anforderbar. Ausdehnung und Titel werden nach
 * innen vererbt, so wie es die WMS-Spezifikation vorsieht.
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

  const layers: WmsCapabilitiesLayer[] = [];
  const walk = (
    node: XmlNode,
    depth: number,
    inheritedBounds?: string
  ): void => {
    for (const layer of childrenNamed(node, 'Layer')) {
      const bounds = boundsOf(layer) ?? inheritedBounds;
      const name = childText(layer, 'Name');
      if (name) {
        layers.push({
          name,
          title: childText(layer, 'Title') ?? name,
          ...(bounds ? { bounds } : {}),
          depth,
        });
      }
      walk(layer, depth + (name ? 1 : 0), bounds);
    }
  };
  if (capability) walk(capability, 0);

  return {
    ...(service && childText(service, 'Title')
      ? { title: childText(service, 'Title') }
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
