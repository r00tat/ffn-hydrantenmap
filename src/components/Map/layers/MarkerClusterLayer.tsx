import {
  createLayerComponent,
  LeafletContextInterface,
} from '@react-leaflet/core';
import L from 'leaflet';
import { MarkerClusterGroup } from 'leaflet.markercluster';
import { LayerGroupProps } from 'react-leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import './MarkerClusterSummary.css';

export interface MarkerClusterLayerOptions extends LayerGroupProps {
  showSummary?: boolean;
}

function getClusterSizeClass(childCount: number): string {
  if (childCount < 10) return 'small';
  if (childCount < 100) return 'medium';
  return 'large';
}

/** Map icon URL patterns to type keys for grouping in cluster badges */
const BADGE_TYPE_MAP: { pattern: string | RegExp; typeKey: string; icon: string }[] = [
  { pattern: '/icons/unterflur-hydrant-icon.png', typeKey: 'hydrant', icon: '/icons/hydrant.png' },
  { pattern: /^\/api\/fzg\?/, typeKey: 'vehicle', icon: '/icons/leaflet/marker-icon.png' },
  { pattern: /^\/api\/icons\/marker\?/, typeKey: 'marker', icon: '/icons/leaflet/marker-icon.png' },
];

function getBadgeTypeInfo(iconUrl: string): { typeKey: string; icon: string } {
  for (const entry of BADGE_TYPE_MAP) {
    if (typeof entry.pattern === 'string') {
      if (iconUrl === entry.pattern) return { typeKey: entry.typeKey, icon: entry.icon };
    } else {
      if (entry.pattern.test(iconUrl)) return { typeKey: entry.typeKey, icon: entry.icon };
    }
  }
  return { typeKey: iconUrl, icon: iconUrl };
}

function escapeHtmlAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function createSummaryIconCreateFunction() {
  return (cluster: any) => {
    const childMarkers = cluster.getAllChildMarkers();
    const childCount = cluster.getChildCount();
    const sizeClass = getClusterSizeClass(childCount);

    // Group markers by type
    const typeCounts = new Map<string, { count: number; icon: string }>();
    for (const marker of childMarkers) {
      const icon = marker.options.icon;
      const iconUrl = icon?.options?.iconUrl || 'unknown';
      const typeInfo = getBadgeTypeInfo(iconUrl);
      const existing = typeCounts.get(typeInfo.typeKey);
      if (existing) {
        existing.count++;
      } else {
        typeCounts.set(typeInfo.typeKey, { count: 1, icon: typeInfo.icon });
      }
    }

    // Build badge HTML sorted by count
    const entries = Array.from(typeCounts.values()).sort(
      (a, b) => b.count - a.count
    );
    const displayEntries = entries.slice(0, 4);
    let badgeHtml = displayEntries
      .map(
        ({ icon, count }) =>
          `<span class="cluster-badge-item"><img src="${escapeHtmlAttr(icon)}" width="14" height="14" alt="" />${count}</span>`
      )
      .join('');
    if (entries.length > 4) {
      badgeHtml += `<span class="cluster-badge-item">+${entries.length - 4}</span>`;
    }

    const html = `<div><span>${childCount}</span></div><span class="cluster-badge-row">${badgeHtml}</span>`;

    return new L.DivIcon({
      html,
      className: `marker-cluster marker-cluster-${sizeClass} marker-cluster-summary`,
      iconSize: new L.Point(40, 50),
    });
  };
}

function createMarkerClusterLayer(
  { children: _c, showSummary, ...options }: MarkerClusterLayerOptions,
  ctx: LeafletContextInterface
) {
  const clusterOptions: Record<string, any> = { ...options };
  if (showSummary) {
    clusterOptions.iconCreateFunction = createSummaryIconCreateFunction();
  }
  const instance = new MarkerClusterGroup([], clusterOptions);
  return { instance, context: { ...ctx, layerContainer: instance } };
}

const MarkerClusterLayer = createLayerComponent<
  MarkerClusterGroup,
  MarkerClusterLayerOptions
>(createMarkerClusterLayer);

export default MarkerClusterLayer;
