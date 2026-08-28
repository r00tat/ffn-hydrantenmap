/**
 * Kartendienste, deren `GetCapabilities` wir kennen.
 *
 * Die Adressen stehen bisher nur in [docs/kartenlayer.md](../../docs/kartenlayer.md)
 * — nachgeschlagen und abgetippt hat sie damit jeder selbst. Hier stehen sie
 * auswählbar, damit eine eigene Kartenebene aus einem bekannten Dienst zwei
 * Klicks kostet statt einer Recherche.
 *
 * **Nur WMS.** Die Import-Hilfe kann nur `GetCapabilities` eines WMS lesen;
 * das WMTS-Capabilities von basemap.at
 * (`https://mapsneu.wien.gv.at/basemap/1.0.0/WMTSCapabilities.xml`) gehört
 * deshalb nicht in diese Liste, und der WISA-Kachel-Cache
 * (`tiles.lfrz.gv.at`) hat gar keines — er antwortet auf jede
 * Capabilities-Anfrage mit `404`.
 *
 * Die Namen bleiben deutsch, wie die Layer-Namen in
 * [tiles.ts](../components/Map/tiles.ts) auch: es sind die Eigennamen der
 * Dienste, keine Oberflächentexte.
 */

export interface KnownWmsService {
  /** Stabiler Schlüssel für die Auswahl. */
  id: string;
  name: string;
  /** Was der Dienst führt — als Entscheidungshilfe in der Auswahl. */
  beschreibung: string;
  /**
   * Die Adresse des Capabilities, nicht die des GetMap. Welche Adresse die
   * Kachelanfragen bekommen, sagt der Dienst im Dokument selbst; siehe
   * `serviceUrlForLayer` in `wmsCapabilities.ts`.
   */
  capabilitiesUrl: string;
}

export const KNOWN_WMS_SERVICES: KnownWmsService[] = [
  {
    id: 'bgld-orthofoto',
    name: 'Land Burgenland — Orthofoto',
    beschreibung: 'Luftbild und Satellitendaten des Landes',
    capabilitiesUrl:
      'https://gisenterprise.bgld.gv.at/arcgis/services/public/Orthofoto/MapServer/WMSServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities',
  },
  {
    id: 'bgld-flaechenwidmung',
    name: 'Land Burgenland — Flächenwidmung',
    beschreibung:
      'Widmungen, Schutz- und Schongebiete, Naturgefahren, Leitungen, Gemeindegrenzen',
    capabilitiesUrl:
      'https://gisenterprise.bgld.gv.at/arcgis/services/public/Nur_Flaechenwidmung/MapServer/WMSServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities',
  },
  {
    id: 'inspire-hochwasser',
    name: 'INSPIRE Hochwasser (Bund)',
    beschreibung:
      'Überflutungsflächen und Risikogebiete HQ30/HQ100/HQ300, APSFR — ohne Oberflächenabfluss',
    capabilitiesUrl:
      'https://inspire.lfrz.gv.at/000801/wms?service=WMS&version=1.3.0&request=GetCapabilities',
  },
];

/** Der bekannte Dienst zu einer Adresse, falls es einer ist. */
export function knownWmsServiceByUrl(
  url?: string
): KnownWmsService | undefined {
  if (!url?.trim()) return undefined;
  const needle = url.trim();
  return KNOWN_WMS_SERVICES.find(
    (service) => service.capabilitiesUrl === needle
  );
}
