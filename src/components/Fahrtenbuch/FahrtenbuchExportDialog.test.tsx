// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import { renderWithIntl } from '../../test-utils/intlRender';
import FahrtenbuchExportDialog from './FahrtenbuchExportDialog';

vi.mock('./fahrtenbuchExportActions', () => ({
  exportFahrtenbuchPdf: vi.fn(),
}));

vi.mock('../firebase/download', () => ({
  downloadBlob: vi.fn().mockResolvedValue(undefined),
}));

import { downloadBlob } from '../firebase/download';
import { exportFahrtenbuchPdf } from './fahrtenbuchExportActions';

const exportMock = vi.mocked(exportFahrtenbuchPdf);
const downloadMock = vi.mocked(downloadBlob);

function vehicle(overrides: Partial<FahrtenbuchVehicle> = {}): FahrtenbuchVehicle {
  return {
    id: 'v1',
    name: 'RLFA 2000',
    active: true,
    counters: VEHICLE_PRESETS.fahrzeug,
    fuelTypes: ['diesel'],
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

const vehicles = [
  vehicle(),
  vehicle({ id: 'v2', name: 'MTF' }),
  vehicle({ id: 'v3', name: 'Altes LF', active: false }),
];

const onClose = vi.fn();

function open(props: Partial<React.ComponentProps<typeof FahrtenbuchExportDialog>> = {}) {
  return renderWithIntl(
    <FahrtenbuchExportDialog
      open
      groupId="ffnd"
      vehicles={vehicles}
      onClose={onClose}
      {...props}
    />,
  );
}

describe('FahrtenbuchExportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exportMock.mockResolvedValue({
      success: true,
      fileName: 'Fahrtenbuch_2026-01-01_2026-08-06.pdf',
      pdfBase64: Buffer.from('%PDF-1.7 test').toString('base64'),
      entryCount: 3,
    });
  });

  it('listet alle Fahrzeuge und hakt sie vor', () => {
    open();

    for (const name of ['RLFA 2000', 'MTF', 'Altes LF']) {
      expect(screen.getByRole('checkbox', { name })).toBeChecked();
    }
  });

  it('kennzeichnet stillgelegte Fahrzeuge', () => {
    open();

    expect(screen.getByText('stillgelegt')).toBeInTheDocument();
  });

  it('exportiert die gewählten Fahrzeuge mit dem Zeitraum', async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole('checkbox', { name: 'MTF' }));
    await user.clear(screen.getByLabelText('Von'));
    await user.type(screen.getByLabelText('Von'), '2026-01-01');
    await user.clear(screen.getByLabelText('Bis'));
    await user.type(screen.getByLabelText('Bis'), '2026-06-30');
    await user.click(screen.getByRole('button', { name: 'PDF erstellen' }));

    await waitFor(() => expect(exportMock).toHaveBeenCalled());
    expect(exportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'ffnd',
        from: '2026-01-01',
        to: '2026-06-30',
        vehicleIds: ['v1', 'v3'],
      }),
    );
  });

  it('lädt das PDF herunter und schließt den Dialog', async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole('button', { name: 'PDF erstellen' }));

    await waitFor(() => expect(downloadMock).toHaveBeenCalled());
    expect(downloadMock.mock.calls[0][1]).toBe(
      'Fahrtenbuch_2026-01-01_2026-08-06.pdf',
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('wählt mit „Keine" alles ab und sperrt den Export', async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole('button', { name: 'Keine' }));

    expect(screen.getByRole('checkbox', { name: 'RLFA 2000' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'PDF erstellen' })).toBeDisabled();
  });

  it('wählt mit „Alle" wieder alles an', async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole('button', { name: 'Keine' }));
    await user.click(screen.getByRole('button', { name: 'Alle' }));

    expect(screen.getByRole('checkbox', { name: 'MTF' })).toBeChecked();
  });

  it('zeigt einen bekannten Fehlerschlüssel übersetzt an', async () => {
    const user = userEvent.setup();
    exportMock.mockResolvedValue({ success: false, error: 'exportTooLarge' });
    open();

    await user.click(screen.getByRole('button', { name: 'PDF erstellen' }));

    expect(
      await screen.findByText(/Zeitraum enthält zu viele Fahrten/i),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it('reicht eine unbekannte Fehlermeldung wörtlich durch', async () => {
    const user = userEvent.setup();
    exportMock.mockResolvedValue({ success: false, error: 'boom' });
    open();

    await user.click(screen.getByRole('button', { name: 'PDF erstellen' }));

    expect(await screen.findByText(/boom/)).toBeInTheDocument();
  });

  it('weist einen umgekehrten Zeitraum ab, ohne den Server zu fragen', async () => {
    const user = userEvent.setup();
    open();

    await user.clear(screen.getByLabelText('Von'));
    await user.type(screen.getByLabelText('Von'), '2026-06-30');
    await user.clear(screen.getByLabelText('Bis'));
    await user.type(screen.getByLabelText('Bis'), '2026-01-01');

    expect(screen.getByRole('button', { name: 'PDF erstellen' })).toBeDisabled();
    expect(exportMock).not.toHaveBeenCalled();
  });

  it('meldet, wenn die Gruppe keine Fahrzeuge hat', () => {
    open({ vehicles: [] });

    expect(screen.getByText('Keine Fahrzeuge vorhanden.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDF erstellen' })).toBeDisabled();
  });
});
