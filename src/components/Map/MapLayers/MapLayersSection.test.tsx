// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirecallMapLayer } from '../../../common/mapLayers';
import { renderWithIntl } from '../../../test-utils/intlRender';

const layers: FirecallMapLayer[] = [
  {
    id: 'a',
    name: 'Orthofoto Burgenland',
    overlayType: 'WMS',
    url: 'https://gis.example.at/wms?',
    wmsLayers: '1',
    opacity: 0.6,
    enabled: true,
  },
];

const addMapLayer = vi.fn();
const updateMapLayer = vi.fn();
const deleteMapLayer = vi.fn();

vi.mock('../../../hooks/useFirecallMapLayers', () => ({
  useFirecallMapLayers: () => layers,
  useFirecallMapLayerActions: () => ({
    addMapLayer,
    updateMapLayer,
    deleteMapLayer,
  }),
}));

// Der Dialog wird eigenständig getestet; hier zählt nur die Verdrahtung.
vi.mock('./MapLayerDialog', () => ({
  default: ({
    layer,
    onClose,
    onDelete,
  }: {
    layer?: FirecallMapLayer;
    onClose: (l?: FirecallMapLayer) => void;
    onDelete?: () => void;
  }) => (
    <>
      <button
        onClick={() =>
          onClose({
            ...(layer ?? {
              overlayType: 'WMTS',
              url: 'https://a.org/{z}/{x}/{y}.png',
            }),
            name: 'Neu',
          })
        }
      >
        dialog-{layer?.id ?? 'neu'}
      </button>
      {onDelete && <button onClick={onDelete}>dialog-löschen</button>}
    </>
  ),
}));

const { default: MapLayersSection } = await import('./MapLayersSection');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MapLayersSection', () => {
  it('zeigt die angelegten Kartenebenen', () => {
    renderWithIntl(<MapLayersSection />);

    expect(screen.getByText('Orthofoto Burgenland')).toBeVisible();
    expect(screen.getByText('https://gis.example.at/wms?')).toBeVisible();
    expect(screen.getByText('Deckkraft 60 %')).toBeVisible();
    expect(screen.getByText('standardmäßig aktiv')).toBeVisible();
  });

  it('bietet einem Gast ohne Schreibrecht keine Bearbeitung an', () => {
    renderWithIntl(<MapLayersSection />);

    expect(screen.queryByTestId('EditIcon')).toBeNull();
    expect(screen.queryByTestId('DeleteIcon')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Kartenebene hinzufügen' })
    ).toBeNull();
  });

  it('legt über den Dialog eine neue Kartenebene an', async () => {
    renderWithIntl(<MapLayersSection canEdit />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Kartenebene hinzufügen' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'dialog-neu' }));

    expect(addMapLayer).toHaveBeenCalledTimes(1);
    expect(updateMapLayer).not.toHaveBeenCalled();
    expect(addMapLayer.mock.calls[0][0]).toMatchObject({ name: 'Neu' });
  });

  it('speichert eine bearbeitete Kartenebene über ihre ID', async () => {
    renderWithIntl(<MapLayersSection canEdit />);

    await userEvent.click(screen.getByTestId('EditIcon'));
    await userEvent.click(screen.getByRole('button', { name: 'dialog-a' }));

    expect(addMapLayer).not.toHaveBeenCalled();
    expect(updateMapLayer.mock.calls[0][0]).toMatchObject({
      id: 'a',
      name: 'Neu',
    });
  });

  it('löscht auch aus dem Dialog heraus — und fragt trotzdem nach', async () => {
    renderWithIntl(<MapLayersSection canEdit />);

    await userEvent.click(screen.getByTestId('EditIcon'));
    await userEvent.click(screen.getByRole('button', { name: 'dialog-löschen' }));
    // Der Dialog ist zu, die Abfrage steht.
    expect(
      screen.queryByRole('button', { name: 'dialog-a' })
    ).not.toBeInTheDocument();
    expect(deleteMapLayer).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'ja' }));
    expect(deleteMapLayer).toHaveBeenCalledWith(layers[0]);
  });

  it('bietet beim Anlegen kein Löschen an', async () => {
    renderWithIntl(<MapLayersSection canEdit />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Kartenebene hinzufügen' })
    );
    expect(
      screen.queryByRole('button', { name: 'dialog-löschen' })
    ).not.toBeInTheDocument();
  });

  it('löscht erst nach Bestätigung', async () => {
    renderWithIntl(<MapLayersSection canEdit />);

    await userEvent.click(screen.getByTestId('DeleteIcon'));
    expect(deleteMapLayer).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'ja' }));
    expect(deleteMapLayer).toHaveBeenCalledWith(layers[0]);
  });
});
