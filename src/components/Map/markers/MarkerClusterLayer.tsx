import {
  createLayerComponent,
  LeafletContextInterface,
} from '@react-leaflet/core';
import { MarkerClusterGroup } from 'leaflet.markercluster';
import { LayerGroupProps } from 'react-leaflet';

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
