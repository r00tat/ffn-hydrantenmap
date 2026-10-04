// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deviationKey, type Geraet, type GeraetBestand } from '../../../common/geraet';
import { GERAET_IMPORT_MAX_BYTES, type GeraetImportPlan } from '../../../common/geraetImport';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { previewGeraetImport, importGeraete } = vi.hoisted(() => ({
  previewGeraetImport: vi.fn(),
  importGeraete: vi.fn(),
}));

vi.mock('../geraeteActions', () => ({ previewGeraetImport, importGeraete }));

import GeraeteImportDialog from './GeraeteImportDialog';

const vlies: Geraet = {
  id: '100',
  externeId: '100',
  bezeichnung: 'Bindevlies Economy',
  verbrauchsmaterial: true,
  bestandGesamt: 3,
  active: true,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};
const srfBestand: GeraetBestand = {
  id: 'b1',
  geraetId: '100',
  lagerortKey: 'fahrzeug|srf|gr 2',
  lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
  anzahl: 3,
};

function plan(over: Partial<GeraetImportPlan> = {}): GeraetImportPlan {
  return {
    create: [
      {
        externeId: '200',
        stammdaten: { bezeichnung: 'Kupplungsschlüssel', active: true },
        bestaende: [
          {
            lagerort: { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
            lagerortKey: 'raum|feuerwehrhaus|lager',
            anzahl: 4,
          },
        ],
        suggestedConsumable: false,
      },
    ],
    update: [],
    unchanged: ['100'],
    bestandCreate: [],
    bestandUnchanged: [],
    bestandUpdate: [],
    deviations: [
      { geraetId: '100', bestandId: 'b1', lagerortKey: 'fahrzeug|srf|gr 2', current: 3, imported: 5 },
      { geraetId: '100', lagerortKey: 'raum|feuerwehrhaus|keller', current: 0, imported: 2 },
    ],
    inactive: [],
    ...over,
  } as GeraetImportPlan;
}

function chooseFile() {
  const input = screen.getByTestId('geraete-import-file');
  const file = new File(['xlsx'], 'export.xlsx');
  fireEvent.change(input, { target: { files: [file] } });
}

describe('GeraeteImportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewGeraetImport.mockResolvedValue(plan());
    importGeraete.mockResolvedValue({ created: 1, deviationsAccepted: 1, deviationsRejected: 1 });
  });

  function render() {
    return renderWithIntl(
      <GeraeteImportDialog
        open
        groupId="ffnd"
        geraete={[vlies]}
        bestaende={[srfBestand]}
        onClose={() => {}}
      />,
    );
  }

  it('schickt die Datei als Base64 an die Vorschau und zeigt den Abgleich', async () => {
    render();
    chooseFile();
    await waitFor(() =>
      expect(previewGeraetImport).toHaveBeenCalledWith('ffnd', btoa('xlsx')),
    );
    expect(await screen.findByText('1 neu')).toBeInTheDocument();
    expect(screen.getByText('2 Abweichungen')).toBeInTheDocument();
    expect(screen.getByText('Kupplungsschlüssel')).toBeInTheDocument();
    expect(screen.getByText('SRF · GR 2: App 3 · Datei 5')).toBeInTheDocument();
    // Ein neuer Lagerort ohne bekannten Bestand: Anzeige aus dem Schlüssel.
    expect(
      screen.getByText('feuerwehrhaus · keller: App 0 · Datei 2 (neuer Lagerort)'),
    ).toBeInTheDocument();
  });

  it('übernimmt Abweichungen nur, wenn sie angehakt sind', async () => {
    const user = userEvent.setup();
    render();
    chooseFile();
    const first = await screen.findByRole('checkbox', {
      name: 'Bindevlies Economy SRF · GR 2',
    });
    expect(first).not.toBeChecked();
    await user.click(first);
    await user.click(screen.getByRole('button', { name: 'Importieren' }));
    await waitFor(() =>
      expect(importGeraete).toHaveBeenCalledWith('ffnd', btoa('xlsx'), [
        deviationKey({ geraetId: '100', lagerortKey: 'fahrzeug|srf|gr 2' }),
      ]),
    );
    expect(await screen.findByText('Import abgeschlossen.')).toBeInTheDocument();
    expect(screen.getByText('Artikel angelegt: 1')).toBeInTheDocument();
    expect(screen.getByText('Abweichungen verworfen: 1')).toBeInTheDocument();
  });

  it('„Alle übernehmen" hakt jede Abweichung an', async () => {
    const user = userEvent.setup();
    render();
    chooseFile();
    await user.click(await screen.findByRole('checkbox', { name: 'Alle übernehmen' }));
    await user.click(screen.getByRole('button', { name: 'Importieren' }));
    await waitFor(() => expect(importGeraete).toHaveBeenCalled());
    expect(importGeraete.mock.calls[0][2]).toHaveLength(2);
  });

  it('zeigt einen Fehler der Vorschau', async () => {
    previewGeraetImport.mockRejectedValue(new Error('file too large'));
    render();
    chooseFile();
    expect(
      await screen.findByText('Die Datei konnte nicht gelesen werden: file too large'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importieren' })).toBeDisabled();
  });

  it('lehnt eine zu große Datei ab, ohne sie zu senden', async () => {
    render();
    const input = screen.getByTestId('geraete-import-file');
    const big = new File([new Uint8Array(GERAET_IMPORT_MAX_BYTES + 1)], 'export.xlsx');
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText(/Die Datei ist zu groß/)).toBeInTheDocument();
    expect(previewGeraetImport).not.toHaveBeenCalled();
  });

  it('lässt den Import ohne Änderungen nicht zu', async () => {
    previewGeraetImport.mockResolvedValue(plan({ create: [], deviations: [] }));
    render();
    chooseFile();
    expect(await screen.findByText('0 neu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importieren' })).toBeDisabled();
  });
});
