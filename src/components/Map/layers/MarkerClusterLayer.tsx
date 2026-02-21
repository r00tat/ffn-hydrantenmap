import {
  createLayerComponent,
  LeafletContextInterface,
} from '@react-leaflet/core';
import L from 'leaflet';
import { MarkerClusterGroup } from 'leaflet.markercluster';
import { LayerGroupProps } from 'react-leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

export type SummaryPosition = '' | 'hover' | 'top' | 'bottom' | 'left' | 'right';

export type ClusterMode = '' | 'wenig' | 'viel';

export interface MarkerClusterLayerOptions extends LayerGroupProps {
  summaryPosition?: SummaryPosition;
  clusterMode?: ClusterMode;
}

/** Map icon URL patterns to type keys for grouping in cluster tooltips */
const TYPE_MAP: { pattern: string | RegExp; typeKey: string }[] = [
  { pattern: '/icons/unterflur-hydrant-icon.png', typeKey: 'unterflurhydrant' },
  { pattern: '/icons/hydrant-icon-fuellen.png', typeKey: 'fuellhydrant' },
  { pattern: '/icons/hydrant.png', typeKey: 'hydrant' },
  { pattern: /^\/api\/fzg\?/, typeKey: 'vehicle' },
  { pattern: /^\/api\/icons\/marker\?/, typeKey: 'marker' },
  { pattern: '/icons/fire.svg', typeKey: 'fire' },
  { pattern: /^\/icons\/rohr/, typeKey: 'rohr' },
  { pattern: '/icons/marker.svg', typeKey: 'marker' },
  { pattern: '/icons/assp.svg', typeKey: 'assp' },
  { pattern: '/icons/el.svg', typeKey: 'el' },
  { pattern: '/icons/circle.svg', typeKey: 'circle' },
  { pattern: '/icons/risiko.svg', typeKey: 'risiko' },
  { pattern: '/icons/gefahr.svg', typeKey: 'gefahr' },
  { pattern: '/icons/loeschteich-icon.png', typeKey: 'loeschteich' },
  { pattern: '/icons/saugstelle-icon.png', typeKey: 'saugstelle' },
];

/** Human-readable labels for grouped type keys */
const TYPE_LABELS: Record<string, string> = {
  hydrant: 'Hydranten',
  unterflurhydrant: 'Unterflurhydranten',
  fuellhydrant: 'Füllhydranten',
  vehicle: 'Fahrzeuge',
  marker: 'Marker',
  fire: 'Einsatzort',
  rohr: 'Rohre',
  assp: 'Atemschutz-Sammelplatz',
  el: 'Einsatzleitung',
  circle: 'Kreise',
  risiko: 'Risikoobjekte',
  gefahr: 'Gefahrobjekte',
  loeschteich: 'Löschteiche',
  saugstelle: 'Saugstellen',
};

function getTypeKey(iconUrl: string): string {
  // Group markers by their tactical sign name
  const tzMatch = iconUrl.match(/\/icons\/taktische_zeichen\/[^/]+\/([^/]+)\.png$/);
  if (tzMatch) return `tz:${tzMatch[1]}`;

  for (const entry of TYPE_MAP) {
    if (typeof entry.pattern === 'string') {
      if (iconUrl === entry.pattern) return entry.typeKey;
    } else {
      if (entry.pattern.test(iconUrl)) return entry.typeKey;
    }
  }
  return iconUrl;
}

function getLabelForTypeKey(typeKey: string): string {
  // Tactical sign: strip prefix and format name
  if (typeKey.startsWith('tz:')) return typeKey.slice(3).replace(/_/g, ' ');

  if (TYPE_LABELS[typeKey]) return TYPE_LABELS[typeKey];
  return typeKey
    .replace(/^.*\//, '')
    .replace(/[-_]/g, ' ')
    .replace(/\.\w+$/, '')
    .replace(/\bicon\b/gi, '')
    .trim() || 'Marker';
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildTooltipContent(cluster: any): string {
  const childMarkers = cluster.getAllChildMarkers();
  const typeCounts = new Map<string, { count: number; icon: string }>();

  for (const marker of childMarkers) {
    const icon = marker.options.icon;
    const iconUrl = icon?.options?.iconUrl || 'unknown';
    const typeKey = getTypeKey(iconUrl);
    const existing = typeCounts.get(typeKey);
    if (existing) {
      existing.count++;
    } else {
      typeCounts.set(typeKey, { count: 1, icon: iconUrl });
    }
  }

  return Array.from(typeCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(
      ([typeKey, { count, icon }]) =>
        `<div style="display:flex;align-items:center;gap:4px;padding:1px 0"><img src="${escapeHtml(icon)}" width="16" height="16" style="object-fit:contain;flex-shrink:0" /><span>${count} ${escapeHtml(getLabelForTypeKey(typeKey))}</span></div>`
    )
    .join('');
}

/** Bind permanent tooltips to all currently visible clusters */
function bindPermanentTooltips(instance: any, direction: string) {
  const fg = instance._featureGroup;
  if (!fg) return;
  fg.eachLayer((layer: any) => {
    if (layer.getAllChildMarkers) {
      const content = buildTooltipContent(layer);
      layer.unbindTooltip();
      layer.bindTooltip(content, { permanent: true, direction });
    }
  });
}

/** Resolve clusterMode preset to MarkerClusterGroup options */
const CLUSTER_PRESETS: Record<string, Record<string, unknown>> = {
  '': { maxClusterRadius: 60 },
  wenig: { maxClusterRadius: 30 },
  viel: { maxClusterRadius: 120 },
};

function createMarkerClusterLayer(
  { children: _c, summaryPosition, clusterMode, ...rest }: MarkerClusterLayerOptions,
  ctx: LeafletContextInterface
) {
  const clusterOptions = CLUSTER_PRESETS[clusterMode || ''] || {};
  const instance = new MarkerClusterGroup(clusterOptions);

  if (summaryPosition === 'hover') {
    instance.on('clustermouseover', (event: L.LeafletEvent) => {
      const cluster = (event as any).propagatedFrom || (event as any).layer;
      if (!cluster?.getAllChildMarkers) return;
      const content = buildTooltipContent(cluster);
      cluster.unbindTooltip();
      cluster.bindTooltip(content, { sticky: false, direction: 'top' }).openTooltip();
    });
  } else if (summaryPosition === 'top' || summaryPosition === 'bottom' || summaryPosition === 'left' || summaryPosition === 'right') {
    const dir = summaryPosition;
    const update = () => bindPermanentTooltips(instance, dir);
    instance.on('animationend', update);
    // Initial bind after markers are added
    setTimeout(update, 500);
  }

  return { instance, context: { ...ctx, layerContainer: instance } };
}

const MarkerClusterLayer = createLayerComponent<
  MarkerClusterGroup,
  MarkerClusterLayerOptions
>(createMarkerClusterLayer);

export default MarkerClusterLayer;
