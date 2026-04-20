import { FirecallLayer } from '../../components/firebase/firestore';

export function createRadiacodeLayer(name: string): FirecallLayer {
  return {
    type: 'layer',
    name,
    layerType: 'radiacode',
    defaultVisible: 'true',
    sampleRate: 'normal',
    dataSchema: [
      { key: 'dosisleistung', label: 'Dosisleistung', unit: 'µSv/h', type: 'number' },
      { key: 'cps', label: 'Counts/s', unit: 'cps', type: 'number' },
      { key: 'device', label: 'Gerät', unit: '', type: 'text' },
    ],
    heatmapConfig: {
      enabled: true,
      activeKey: 'dosisleistung',
      colorMode: 'auto',
      visualizationMode: 'interpolation',
      interpolationAlgorithm: 'inv-square',
      interpolationRadius: 30,
      interpolationOpacity: 0.6,
      colorScale: 'log',
    },
  };
}
