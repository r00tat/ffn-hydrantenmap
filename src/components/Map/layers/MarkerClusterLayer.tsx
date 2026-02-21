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

function createSummaryIconCreateFunction() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (cluster: any) => {
    const childMarkers = cluster.getAllChildMarkers();
    const childCount = cluster.getChildCount();
    const sizeClass = getClusterSizeClass(childCount);

    // Group markers by icon URL
    const iconCounts = new Map<string, number>();
    for (const marker of childMarkers) {
      const icon = marker.options.icon;
      const iconUrl = icon?.options?.iconUrl || 'unknown';
      iconCounts.set(iconUrl, (iconCounts.get(iconUrl) || 0) + 1);
    }

    // Build badge HTML
    let badgeHtml = '';
    const entries = Array.from(iconCounts.entries()).sort(
      (a, b) => b[1] - a[1]
    );
    // Limit to 4 types max to keep it compact
    const displayEntries = entries.slice(0, 4);
    badgeHtml = displayEntries
      .map(
        ([url, count]) =>
          `<span class="cluster-badge-item"><img src="${url}" width="14" height="14" alt="" />${count}</span>`
      )
      .join('');
    if (entries.length > 4) {
      badgeHtml += `<span class="cluster-badge-item">+${entries.length - 4}</span>`;
    }

    const html = `<div><span>${childCount}</span></div><div class="cluster-badge-row">${badgeHtml}</div>`;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
