// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../../test-utils/intlRender';

const dispose = vi.fn();
const setMesh = vi.fn();
const scene = {
  setMesh,
  setTexture: vi.fn(),
  setMarkers: vi.fn(),
  setPumps: vi.fn(),
  setPaths: vi.fn(),
  setContours: vi.fn(),
  setContoursVisible: vi.fn(),
  setExaggeration: vi.fn(),
  onAzimuth: vi.fn(),
  resize: vi.fn(),
  dispose,
};

// Die Szene wird gemockt: jsdom hat keinen WebGL-Kontext, und geprüft werden
// soll die Verdrahtung, nicht three.
const createScene = vi.fn(() => scene);
vi.mock('./gelaende3dScene', () => ({
  createGelaende3dScene: (...args: unknown[]) => createScene(...(args as [])),
}));

const meshResult = vi.fn();
const contoursResult = vi.fn();
vi.mock('../../../common/terrain/terrainClient', () => ({
  terrainClient: () => ({
    mesh: () => meshResult(),
    contours: () => contoursResult(),
  }),
}));

vi.mock('./terrainTexture', async () => {
  const actual =
    await vi.importActual<typeof import('./terrainTexture')>('./terrainTexture');
  return {
    ...actual,
    composeTexture: vi.fn(async () => document.createElement('canvas')),
  };
});

// Das Elementregister zieht Firestore und Storage herein; für die Verdrahtung
// des Dialogs spielt es keine Rolle.
vi.mock('../../FirecallItems/elements', () => ({
  getItemInstance: () => ({
    title: () => 'Marke',
    icon: () => ({ options: { iconUrl: '/icon.png' } }),
  }),
}));

import Gelaende3dDialog from './Gelaende3dDialog';

const bounds = { south: 47.94, west: 16.83, north: 47.96, east: 16.87 };

const mesh = {
  positions: new Float32Array(12),
  indices: new Uint32Array([0, 2, 1]),
  holes: new Uint8Array(4),
  cols: 2,
  rows: 2,
  widthM: 1000,
  depthM: 1000,
  minM: 120,
  maxM: 180,
  level: 'detail' as const,
  resolutionM: 1,
  center: [47.95, 16.85] as [number, number],
  merc: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 },
};

beforeEach(() => {
  vi.clearAllMocks();
  createScene.mockReturnValue(scene);
  meshResult.mockResolvedValue(mesh);
  contoursResult.mockResolvedValue({ lines: [] });
});

describe('Gelaende3dDialog', () => {
  it('zeigt Überhöhung, Spanne, Rasterweite und die BEV-Nennung', async () => {
    renderWithIntl(
      <Gelaende3dDialog
        open
        onClose={() => undefined}
        bounds={bounds}
        zoom={17}
        items={[]}
        equidistanceM={1}
      />
    );
    await waitFor(() => expect(setMesh).toHaveBeenCalled());
    expect(await screen.findByText(/überhöht/i)).toBeInTheDocument();
    expect(screen.getByText(/120 bis 180 m/)).toBeInTheDocument();
    expect(screen.getByText(/Detailstufe/)).toBeInTheDocument();
    expect(screen.getByText(/Raster 1 m/)).toBeInTheDocument();
    expect(
      screen.getByText(/Bundesamt für Eich- und Vermessungswesen/)
    ).toBeInTheDocument();
  });

  it('meldet fehlendes Gelände, statt schwarz zu bleiben', async () => {
    meshResult.mockResolvedValue(undefined);
    renderWithIntl(
      <Gelaende3dDialog
        open
        onClose={() => undefined}
        bounds={bounds}
        zoom={17}
        items={[]}
        equidistanceM={1}
      />
    );
    expect(await screen.findByText(/kein Höhenmodell vor/i)).toBeInTheDocument();
  });

  it('meldet fehlendes WebGL', async () => {
    createScene.mockImplementation(() => {
      throw new Error('no webgl');
    });
    renderWithIntl(
      <Gelaende3dDialog
        open
        onClose={() => undefined}
        bounds={bounds}
        zoom={17}
        items={[]}
        equidistanceM={1}
      />
    );
    expect(await screen.findByText(/braucht WebGL/i)).toBeInTheDocument();
  });

  it('gibt die Szene beim Schließen frei', async () => {
    const { unmount } = renderWithIntl(
      <Gelaende3dDialog
        open
        onClose={() => undefined}
        bounds={bounds}
        zoom={17}
        items={[]}
        equidistanceM={1}
      />
    );
    await waitFor(() => expect(setMesh).toHaveBeenCalled());
    unmount();
    expect(dispose).toHaveBeenCalled();
  });
});
