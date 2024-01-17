import {
  createLayerComponent,
  LeafletContextInterface,
} from '@react-leaflet/core';
import { MarkerClusterGroup } from 'leaflet.markercluster';
import { LayerGroupProps } from 'react-leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

export interface MarkerClusterLayerOptions extends LayerGroupProps {}

function createMarkerClusterLayer(
  { children: _c, ...options }: MarkerClusterLayerOptions,
  ctx: LeafletContextInterface
) {
  const instance = new MarkerClusterGroup([], options);
  return { instance, context: { ...ctx, layerContainer: instance } };
}

const MarkerClusterLayer = createLayerComponent<
  MarkerClusterGroup,
  MarkerClusterLayerOptions
>(createMarkerClusterLayer);

export default MarkerClusterLayer;
