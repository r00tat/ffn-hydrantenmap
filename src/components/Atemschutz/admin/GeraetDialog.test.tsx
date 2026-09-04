// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtemschutzGeraet } from '../../../common/atemschutz';
import { renderWithIntl } from '../../../test-utils/intlRender';

// Abonniert die Fahrzeuge der Gruppe und initialisiert damit Firebase, das im
// Test keine Konfiguration hat.
const { useFahrtenbuchVehicles } = vi.hoisted(() => ({
  useFahrtenbuchVehicles: vi.fn(),
}));

vi.mock('../../../hooks/useFahrtenbuchVehicles', () => ({
  default: useFahrtenbuchVehicles,
}));

import GeraetDialog from './GeraetDialog';

/** Eine mobile Füllstation — nur dort gibt es die Fahrzeugwahl. */
function kompressor(over: Partial<AtemschutzGeraet> = {}): AtemschutzGeraet {
  return {
    id: 'k1',
    typ: 'fuellstation',
    bezeichnung: 'Atemluftkompressor Mobil',
    feuerwehr: 'Neusiedl am See',
    active: true,
    standort: 'mobil',
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

describe('GeraetDialog', () => {
  const onSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onSave.mockResolvedValue(undefined);
    useFahrtenbuchVehicles.mockReturnValue({
      activeVehicles: [
        { id: 'v1', name: 'TLFA 4000', active: true },
        { id: 'v2', name: 'MTFA', active: true },
      ],
      vehicles: [],
      vehiclesById: new Map(),
    });
  });

  function render(geraet: AtemschutzGeraet) {
    return renderWithIntl(
      <GeraetDialog
        open
        geraet={geraet}
        feuerwehren={['Neusiedl am See']}
        groupId="ffnd"
        onClose={() => {}}
        onSave={onSave}
      />,
    );
  }

  it('übernimmt ein Fahrzeug der Gruppe mit ID und Namen', async () => {
    const user = userEvent.setup();
    render(kompressor());

    const feld = screen.getByLabelText(/Fahrzeug oder Anhänger/);
    await user.click(feld);
    await user.click(await screen.findByText('TLFA 4000'));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ vehicleId: 'v1', vehicleName: 'TLFA 4000' }),
      ),
    );
  });

  it('nimmt einen frei eingetippten Anhänger ohne Fahrzeug-ID', async () => {
    // Anhänger stehen nicht im Fahrtenbuch — sie führen kein eigenes
    // Fahrtenbuch. Ohne freie Eingabe ließe sich der Atemschutzanhänger, auf
    // dem der Kompressor verlastet ist, gar nicht eintragen.
    const user = userEvent.setup();
    render(kompressor());

    await user.type(
      screen.getByLabelText(/Fahrzeug oder Anhänger/),
      'ATS-Anhänger',
    );
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          vehicleId: undefined,
          vehicleName: 'ATS-Anhänger',
        }),
      ),
    );
  });

  it('zeigt den gespeicherten Träger beim Öffnen an', () => {
    render(kompressor({ vehicleName: 'ATS-Anhänger' }));
    expect(screen.getByLabelText(/Fahrzeug oder Anhänger/)).toHaveValue(
      'ATS-Anhänger',
    );
  });

  it('verwirft den Träger, wenn die Station auf fix umgestellt wird', async () => {
    // Eine fixe Station steht im Feuerwehrhaus; ein Fahrzeugbezug wäre ein
    // Widerspruch im Datensatz.
    const user = userEvent.setup();
    render(kompressor({ vehicleId: 'v1', vehicleName: 'TLFA 4000' }));

    await user.click(screen.getByLabelText('Standort'));
    await user.click(await screen.findByRole('option', { name: /Fix/ }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          standort: 'fix',
          vehicleId: undefined,
          vehicleName: undefined,
        }),
      ),
    );
  });

  it('bietet die Fahrzeugwahl nur bei einer mobilen Station an', () => {
    render(kompressor({ standort: 'fix' }));
    expect(screen.queryByLabelText(/Fahrzeug oder Anhänger/)).toBeNull();
  });

  it('zeigt Nenndruck und Volumen nur bei einer Flasche', async () => {
    // Beide Felder beschreiben die Flasche. An einer Maske oder einem
    // Kompressor stünde dort eine Erfindung — der Import lässt sie dort aus
    // demselben Grund weg.
    const user = userEvent.setup();
    render(kompressor({ typ: 'flasche' }));

    expect(screen.getByLabelText('Nenndruck (bar)')).toBeInTheDocument();
    expect(screen.getByLabelText('Volumen (l)')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Typ'));
    await user.click(await screen.findByRole('option', { name: 'Atemmaske' }));

    expect(screen.queryByLabelText('Nenndruck (bar)')).toBeNull();
    expect(screen.queryByLabelText('Volumen (l)')).toBeNull();
  });

  it('schickt Nenndruck und Volumen nicht mit, wenn der Typ keine Flasche ist', async () => {
    const user = userEvent.setup();
    render(kompressor({ typ: 'flasche', nenndruck: 300, volumenLiter: 6.8 }));

    await user.click(screen.getByLabelText('Typ'));
    await user.click(await screen.findByRole('option', { name: 'Atemmaske' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          nenndruck: undefined,
          volumenLiter: undefined,
        }),
      ),
    );
  });

  it('stellt die Inventarnummer vor die Flaschennummer', () => {
    // Die Inventarnummer ist die führende Kennung — sie steht auf dem
    // Etikett, das gescannt wird. Sie gehört deshalb in die erste Zeile und
    // nicht hinter die Flaschennummer.
    render(kompressor({ typ: 'flasche' }));

    const felder = screen.getAllByRole('textbox');
    const namen = felder.map(
      (f) => f.getAttribute('id') ?? f.getAttribute('name') ?? '',
    );
    const inventar = felder.indexOf(screen.getByLabelText('Inventar-Nr.'));
    const flasche = felder.indexOf(screen.getByLabelText('Flaschennummer'));

    expect(inventar).toBeGreaterThanOrEqual(0);
    expect(flasche).toBeGreaterThanOrEqual(0);
    expect(inventar, namen.join(', ')).toBeLessThan(flasche);
  });

  it('lässt oben Platz, damit das Label der ersten Zeile nicht abgeschnitten wird', () => {
    // `DialogContent` direkt unter `DialogTitle` hat in MUI kein oberes
    // Padding; das nach oben versetzte Label eines Outlined-Feldes wird sonst
    // vom Scroll-Container beschnitten.
    render(kompressor());
    const inhalt = document.querySelector('.MuiDialogContent-root');
    const grid = inhalt?.firstElementChild;
    expect(grid).toBeTruthy();
    expect(getComputedStyle(grid as Element).marginTop).not.toBe('0px');
  });
});
