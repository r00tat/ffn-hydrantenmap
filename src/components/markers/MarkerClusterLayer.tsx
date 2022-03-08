import {
  EventedProps,
  createLayerComponent,
  LeafletContextInterface,
} from '@react-leaflet/core';
import { LayerGroup as LeafletLayerGroup, LayerOptions } from 'leaflet';
import { ReactNode } from 'react';

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
