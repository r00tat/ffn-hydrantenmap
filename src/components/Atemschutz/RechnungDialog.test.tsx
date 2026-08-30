// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtemschutzFuellung } from '../../common/atemschutz';
import type { AtemschutzEmpfaenger, FeuerwehrBuendel } from '../../common/atemschutzRechnung';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('./rechnungActions', () => ({
  createFuellungRechnung: createMock,
  saveAtemschutzEmpfaenger: vi.fn(),
}));

import { renderWithIntl } from '../../test-utils/intlRender';
import RechnungDialog from './RechnungDialog';

const PREISE = { '5.01': 4.3, '5.02': 6.4 };

function fuellung(over: Partial<AtemschutzFuellung> = {}): AtemschutzFuellung {
  return {
    id: 'a',
    flaschenNummer: '2.16.19',
    anzahl: 1,
    enddruck: 300,
    gefuelltVon: 'Paul',
    zeitpunkt: '2026-08-29T10:00:00.000Z',
    firecallId: '',
    verrechnen: true,
    feuerwehr: 'Winden am See',
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

function empfaenger(): AtemschutzEmpfaenger {
  return {
    id: 'e1',
    feuerwehr: 'Winden am See',
    name: 'FF Winden',
    adresse: 'Hauptstraße 1',
    email: 'kdo@ff-winden.at',
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
  };
}

const BUENDEL: FeuerwehrBuendel = {
  feuerwehr: 'Winden am See',
  fuellungen: [
    fuellung({ id: 'a', flaschenNummer: '2.16.19' }),
    fuellung({ id: 'b', flaschenNummer: '2.16.04' }),
  ],
  flaschen: 2,
  summe: 8.6,
  von: '2026-08-29T10:00:00.000Z',
  bis: '2026-08-29T10:00:00.000Z',
};

function render(over: Partial<React.ComponentProps<typeof RechnungDialog>> = {}) {
  return renderWithIntl(
    <RechnungDialog
      open
      groupId="ffnd"
      buendel={BUENDEL}
      empfaenger={[empfaenger()]}
      preise={PREISE}
      vorgabeTarif="5.01"
      volumen={{}}
      feuerwehren={['Winden am See']}
      onClose={vi.fn()}
      onCreated={vi.fn()}
      {...over}
    />,
  );
}

describe('RechnungDialog', () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue({ success: true, id: 'r1' });
  });

  it('hakt beim Öffnen alle Zeilen an und zeigt die Summe des Bündels', () => {
    render();

    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).toBeChecked();
    }
    expect(screen.getByText(/Summe: .*8,60/)).toBeInTheDocument();
  });

  it('senkt die Summe, wenn eine Zeile abgewählt wird', () => {
    render();

    fireEvent.click(screen.getAllByRole('checkbox')[0]);

    expect(screen.getByText(/Summe: .*4,30/)).toBeInTheDocument();
  });

  it('setzt über „Alle auf Tarif" jede gewählte Zeile auf 5.02', () => {
    render();

    fireEvent.click(screen.getByRole('button', { name: '5.02' }));

    expect(screen.getByText(/Summe: .*12,80/)).toBeInTheDocument();
  });

  it('sperrt „Rechnung", solange kein Empfänger im Adressbuch steht', () => {
    render({ empfaenger: [] });

    expect(screen.getByRole('button', { name: 'Rechnung' })).toBeDisabled();
  });

  it('übergibt die gewählten Füllungen und den Empfänger an die Action', async () => {
    render();

    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Rechnung' }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'ffnd',
        empfaengerId: 'e1',
        positionen: [{ fuellungId: 'a', tarifId: undefined }],
      }),
    );
  });
});
