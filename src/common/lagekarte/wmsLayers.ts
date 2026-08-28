/**
 * Eigene Kartenebenen im Austausch mit lagekarte.info.
 *
 * lagekarte.info führt WMS-Ebenen in einem eigenen Feld `wmslayers` auf
 * Dateiebene. Sein Schema ist seit `captures/lagekarte (3).json` belegt:
 *
 * ```json
 * {
 *   "url": "https://inspire.lfrz.gv.at/000801/ows?SERVICE=WMS&",
 *   "layer": "Hochwasserrisikogebiete HQ100",
 *   "name": "Hochwasserrisikogebiete HQ100",
 *   "bounds": "8.468,45.501,19.638,49.713",
 *   "disabled": true
 * }
 * ```
 *
 * **Die Reihenfolge in `bounds` ist eine andere als unsere.** Dort steht
 * `west,süd,ost,nord` — die BBox-Reihenfolge von WMS und GeoJSON, also
 * Länge zuerst. `FirecallMapLayer.bounds` folgt dagegen Leaflet mit
 * `süd,west,nord,ost`. Im Beispiel oben sind `8.468` und `19.638` Längengrade
 * und `45.501`/`49.713` Breitengrade: als Leaflet-Rechteck gelesen läge die
 * Ebene irgendwo im Indischen Ozean. Deshalb wird in beide Richtungen getauscht.
 *
 * Was lagekarte.info nicht kennt: Deckkraft, Format, Transparenz, Zoomgrenzen,
 * Stapelung — und Kachel-Ebenen (WMTS/XYZ) überhaupt nicht. Damit der Weg
 * FFN → Datei → FFN trotzdem verlustfrei bleibt, schreibt der Export
 * zusätzlich einen `ffnd`-Block auf Dateiebene; den liest nur diese App.
 */

import {
  clampOpacity,
  isSafeMapLayerUrl,
  isValidBoundsInput,
  type FirecallMapLayer,
} from '../mapLayers';
import type { LagekarteWmsLayer } from './types';

/**
 * Felder, die beim Übernehmen aus dem `ffnd`-Block wegfallen — dieselbe Regel
 * wie bei den Elementen: Identität und Herkunft gehören zum alten Dokument.
 */
const DROPPED_FIELDS = [
  'id',
  'created',
  'creator',
  'updatedAt',
  'updatedBy',
  'deleted',
] as const;

/** `süd,west,nord,ost` → `west,süd,ost,nord`. */
export function boundsToLagekarte(value?: string): string | undefined {
  if (!isValidBoundsInput(value) || !value?.trim()) return undefined;
  const [south, west, north, east] = value.split(',').map((p) => p.trim());
  return `${west},${south},${east},${north}`;
}

/** `west,süd,ost,nord` → `süd,west,nord,ost`. */
export function boundsFromLagekarte(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const parts = value.split(',').map((p) => p.trim());
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(Number(p)))) {
    return undefined;
  }
  const [west, south, east, north] = parts;
  const swapped = `${south},${west},${north},${east}`;
  return isValidBoundsInput(swapped) ? swapped : undefined;
}

/**
 * Die WMS-Ebenen für das `wmslayers`-Feld.
 *
 * Kachel-Ebenen bleiben außen vor: `wmslayers` kennt nur `url` + `layer`, ein
 * `{z}/{x}/{y}`-Template hätte dort keine Bedeutung. Sie gehen über den
 * `ffnd`-Block trotzdem nicht verloren.
 */
export function toLagekarteWmsLayers(
  layers: FirecallMapLayer[] = []
): LagekarteWmsLayer[] {
  return layers
    .filter(
      (layer) =>
        !layer.deleted &&
        layer.overlayType === 'WMS' &&
        isSafeMapLayerUrl(layer.url) &&
        !!layer.wmsLayers?.trim()
    )
    .map((layer) => {
      const bounds = boundsToLagekarte(layer.bounds);
      return {
        url: layer.url,
        layer: layer.wmsLayers!.trim(),
        name: layer.name,
        ...(bounds ? { bounds } : {}),
        // lagekarte notiert die Sichtbarkeit umgekehrt zu uns.
        disabled: layer.enabled !== true,
      };
    });
}

/** Die Kartenebenen, die in den `ffnd`-Block der Datei gehören. */
export function toFfndMapLayers(
  layers: FirecallMapLayer[] = []
): FirecallMapLayer[] {
  return layers.filter((layer) => !layer.deleted);
}

function stripIdentity(layer: FirecallMapLayer): FirecallMapLayer {
  const clean = { ...layer } as unknown as Record<string, unknown>;
  for (const key of DROPPED_FIELDS) delete clean[key];
  return clean as unknown as FirecallMapLayer;
}

/**
 * Eine fremde `wmslayers`-Angabe als eigene Kartenebene.
 *
 * Alles, was lagekarte nicht führt, bekommt die Vorbelegung: PNG, transparent,
 * volle Deckkraft. Eine Ebene ohne brauchbare `url` oder ohne `layer` fällt
 * weg — die Datei kommt von außen und ist nicht vertrauenswürdig.
 */
export function mapLayersFromWmsLayers(
  entries: unknown,
  warnings: string[] = []
): FirecallMapLayer[] {
  if (!Array.isArray(entries)) return [];
  const result: FirecallMapLayer[] = [];

  for (const raw of entries) {
    const entry = raw as Partial<LagekarteWmsLayer> | null;
    const url = typeof entry?.url === 'string' ? entry.url.trim() : '';
    const wmsLayers =
      typeof entry?.layer === 'string' ? entry.layer.trim() : '';
    const name =
      (typeof entry?.name === 'string' && entry.name.trim()) || wmsLayers;

    if (!isSafeMapLayerUrl(url)) {
      warnings.push(
        `Kartenebene „${name || url || 'ohne Namen'}" übersprungen: keine https-Adresse`
      );
      continue;
    }
    if (!wmsLayers) {
      warnings.push(`Kartenebene „${name}" übersprungen: kein LAYERS-Wert`);
      continue;
    }

    const bounds = boundsFromLagekarte(entry?.bounds);
    result.push({
      name,
      overlayType: 'WMS',
      url,
      wmsLayers,
      format: 'image/png',
      transparent: true,
      opacity: 1,
      enabled: entry?.disabled !== true,
      ...(bounds ? { bounds } : {}),
    });
  }

  return result;
}

/**
 * Die Kartenebenen einer Lagekarte-Datei.
 *
 * Der `ffnd`-Block gewinnt: er stammt aus dieser App und trägt alles, was
 * `wmslayers` nicht kennt. Fehlt er — die Datei kommt von lagekarte.info —,
 * wird aus `wmslayers` rekonstruiert.
 */
export function mapLayersFromLagekarte(
  file: { wmslayers?: unknown; ffnd?: { mapLayers?: unknown } },
  warnings: string[] = []
): FirecallMapLayer[] {
  const own = file.ffnd?.mapLayers;
  if (Array.isArray(own)) {
    return own
      .map((layer) => stripIdentity(layer as FirecallMapLayer))
      .filter((layer) => {
        if (isSafeMapLayerUrl(layer.url)) return true;
        warnings.push(
          `Kartenebene „${layer.name ?? 'ohne Namen'}" übersprungen: keine https-Adresse`
        );
        return false;
      })
      .map((layer) => ({ ...layer, opacity: clampOpacity(layer.opacity) }));
  }
  return mapLayersFromWmsLayers(file.wmslayers, warnings);
}
