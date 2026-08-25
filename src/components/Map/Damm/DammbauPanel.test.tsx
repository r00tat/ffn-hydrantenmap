// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LatLngPosition } from '../../../common/geo';
import type { Diary, Line } from '../../firebase/firestore';
import { renderWithIntl } from '../../../test-utils/intlRender';

const addItem = vi.fn((_item: unknown) => Promise.resolve({ id: 'neu' }));
vi.mock('../../../hooks/useFirecallItemAdd', () => ({
  default: () => addItem,
}));

const updateItem = vi.fn((_item: unknown) => Promise.resolve());
vi.mock('../../../hooks/useFirecallItemUpdate', () => ({
  default: () => updateItem,
}));

const showSnackbar = vi.fn();
vi.mock('../../providers/SnackbarProvider', () => ({
  useSnackbar: () => showSnackbar,
}));

// Die anderen Dammabschnitte kommen über den Firestore-Client; hier zählt nur,
// was der Rechner daraus summiert.
const linien = vi.fn<() => Line[]>(() => []);
// Der Sandsackrechner liest die Wasserstands-Szenarien des Einsatzes; ohne
// Mock zöge das den echten Firestore-Listener herein.
vi.mock('../../../hooks/useWasserstandSzenarien', () => ({
  default: () => [],
}));

vi.mock('../../../hooks/useDammLinien', () => ({
  default: () => linien(),
}));

import DammbauPanel from './DammbauPanel';

const start: LatLngPosition = [47.9482, 16.8482];
/** Rund 200 m nach Norden. */
const ende: LatLngPosition = [47.9482 + 200 / 111_320, 16.8482];

const line = (overrides: Partial<Line> = {}): Line =>
  ({
    id: 'linie-1',
    type: 'line',
    name: 'Uferstraße',
    lat: start[0],
    lng: start[1],
    destLat: ende[0],
    destLng: ende[1],
    positions: JSON.stringify([start, ende]),
    dammbau: 'true',
    ...overrides,
  }) as Line;

/** Die Zahl neben einer Beschriftung in der Ergebnistabelle. */
const wert = (label: string) =>
  screen.getByText(label).closest('tr')?.lastElementChild?.textContent ?? '';

const saecke = () => Number(/(\d+)/.exec(wert('Säcke im Damm'))?.[1] ?? 0);

describe('DammbauPanel', () => {
  beforeEach(() => {
    addItem.mockClear();
    updateItem.mockClear();
    showSnackbar.mockClear();
    linien.mockReset();
    linien.mockReturnValue([]);
  });

  it('zeichnet nichts, solange es nicht geöffnet ist', () => {
    renderWithIntl(
      <DammbauPanel item={line()} open={false} onClose={() => {}} />
    );
    expect(screen.queryByText('Sandsackbedarf Dammbau')).toBeNull();
  });

  it('zeigt Länge, Sackzahl und Bauzeit für die gezeichnete Linie', () => {
    renderWithIntl(<DammbauPanel item={line()} open onClose={() => {}} />);

    expect(screen.getByText('Sandsackbedarf Dammbau')).toBeInTheDocument();
    expect(screen.getByText('Uferstraße')).toBeInTheDocument();
    // Die Länge kommt aus der Leaflet-Messung und ist rund 200 m.
    expect(screen.getByText('Dammlänge').nextElementSibling).toHaveTextContent(
      /^(19|20|21)\d m$/
    );
    expect(saecke()).toBeGreaterThan(0);
    // Vorgegeben sind die Kräfte, gerechnet wird die Bauzeit.
    expect(wert('Bauzeit (gerechnet)')).toMatch(/h$/);
  });

  it('rechnet auf Vorgabe der Fertigstellung die Kräfte statt der Bauzeit', async () => {
    const user = userEvent.setup();
    renderWithIntl(<DammbauPanel item={line()} open onClose={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Fertigstellung' }));

    await waitFor(() =>
      expect(screen.getByText('Kräfte (gerechnet)')).toBeInTheDocument()
    );
    // Das Eingabefeld hat gewechselt: jetzt die Zeit, nicht die Kräfte.
    expect(
      screen.getByRole('spinbutton', { name: /Fertig in/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /^Kräfte/ })).toBeNull();
    expect(Number(/(\d+)/.exec(wert('Kräfte (gerechnet)'))?.[1] ?? 0)).toBeGreaterThan(0);
  });

  it('rechnet die Sackzahl bei einer größeren Dammhöhe neu', async () => {
    const user = userEvent.setup();
    renderWithIntl(<DammbauPanel item={line()} open onClose={() => {}} />);

    const vorher = saecke();
    const hoehe = screen.getByRole('spinbutton', { name: 'Dammhöhe' });
    await user.clear(hoehe);
    await user.type(hoehe, '1.5');

    await waitFor(() => expect(saecke()).toBeGreaterThan(vorher));
  });

  it('warnt beim einreihigen Wall über der standsicheren Höhe', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <DammbauPanel item={line({ dammHoehe: 1 })} open onClose={() => {}} />
    );

    await user.click(screen.getByRole('button', { name: 'Einreihiger Wall' }));
    await waitFor(() =>
      expect(
        screen.getByText(/einreihige Anordnungen bis 30 cm/)
      ).toBeInTheDocument()
    );
  });

  it('weist die Verlegetabelle als Herkunft der Sackzahl aus', () => {
    renderWithIntl(
      <DammbauPanel item={line({ dammHoehe: 1 })} open onClose={() => {}} />
    );
    expect(
      screen.getByText(/^aus der Verlegetabelle — Lehrunterlage/)
    ).toBeInTheDocument();
    // 120 Säcke je Meter bei 1 m Höhe, rund 200 m Linie
    expect(saecke()).toBeGreaterThan(23_000);
    expect(saecke()).toBeLessThan(25_000);
  });

  it('rechnet den Notdamm mit der Hälfte der Säcke', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <DammbauPanel item={line({ dammHoehe: 1 })} open onClose={() => {}} />
    );

    const stapel = saecke();
    await user.click(screen.getByRole('button', { name: 'Notdamm' }));
    await waitFor(() => expect(saecke()).toBeLessThan(stapel));
    expect(saecke()).toBeCloseTo(stapel / 2, -1);
  });

  it('schaltet mit einer eingetragenen Basisbreite auf die Geometrie um', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <DammbauPanel item={line({ dammHoehe: 1 })} open onClose={() => {}} />
    );

    await user.type(
      screen.getByRole('spinbutton', { name: /Basisbreite/ }),
      '3'
    );
    await waitFor(() =>
      expect(
        screen.getByText(/^über die Böschung gerechnet$/)
      ).toBeInTheDocument()
    );
    expect(
      screen.getByText(/^Gerechnet wird über die eingetragene Basisbreite/)
    ).toBeInTheDocument();
  });

  it('macht Füllhilfe und Zubinden in der Bauzeit sichtbar', async () => {
    const user = userEvent.setup();
    renderWithIntl(<DammbauPanel item={line()} open onClose={() => {}} />);

    const bauzeit = () => Number.parseFloat(wert('Bauzeit (gerechnet)'));
    const ohne = bauzeit();

    await user.click(screen.getByLabelText(/Füllhilfe/));
    await waitFor(() => expect(bauzeit()).toBeLessThan(ohne));

    await user.click(screen.getByLabelText(/zubinden/));
    await waitFor(() => expect(bauzeit()).toBeGreaterThan(ohne));
  });

  it('rechnet die Trageweite in die Transportleistung', async () => {
    const user = userEvent.setup();
    renderWithIntl(<DammbauPanel item={line()} open onClose={() => {}} />);

    // 80 Säcke je Person und Stunde auf 10 m
    expect(wert('Transport je Person und Stunde')).toMatch(/^80 /);

    const weite = screen.getByRole('spinbutton', {
      name: /Trageweite der Kette/,
    });
    await user.clear(weite);
    await user.type(weite, '40');

    await waitFor(() =>
      expect(wert('Transport je Person und Stunde')).toMatch(/^20 /)
    );
    expect(wert('Helfer für die Kette')).toMatch(/^40 /);
  });

  it('nennt Paletten und LKW-Fuhren nach der Unterlage', () => {
    renderWithIntl(
      <DammbauPanel item={line({ dammHoehe: 1 })} open onClose={() => {}} />
    );
    // 50 Säcke je Palette, 10 Paletten je LKW
    const paletten = Number(/(\d+)/.exec(wert('Paletten'))?.[1] ?? 0);
    expect(paletten).toBe(Math.ceil(saecke() / 50));
    expect(
      Number(/(\d+)/.exec(wert('LKW-Fuhren gefüllte Säcke'))?.[1] ?? 0)
    ).toBe(Math.ceil(paletten / 10));
  });

  it('speichert die Werte an der Linie', async () => {
    const user = userEvent.setup();
    renderWithIntl(<DammbauPanel item={line()} open onClose={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));

    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1));
    expect(updateItem.mock.calls[0][0]).toMatchObject({
      id: 'linie-1',
      dammbau: 'true',
      dammBauweise: 'pyramide',
      // Die Schalter liegen am Element als Zeichenkette.
      fuellTrichter: 'false',
      saeckeRoedeln: 'false',
    });
    // Ohne Handeingabe bleibt die Böschung leer — sonst schaltete ein
    // Speichern den Rechner von der Tabelle auf die Geometrie um.
    expect(updateItem.mock.calls[0][0]).toHaveProperty(
      'dammBoeschung',
      undefined
    );
    expect(showSnackbar).toHaveBeenCalledWith(
      'Dammlinie gespeichert',
      'success'
    );
  });

  it('legt die Materialanforderung als Tagebucheintrag ab', async () => {
    const user = userEvent.setup();
    renderWithIntl(<DammbauPanel item={line()} open onClose={() => {}} />);

    await user.click(
      screen.getByRole('button', { name: 'Materialanforderung ins Tagebuch' })
    );

    await waitFor(() => expect(addItem).toHaveBeenCalled());
    const entry = addItem.mock.calls[0][0] as Diary;
    expect(entry.type).toBe('diary');
    expect(entry.name).toContain('Uferstraße');
    expect(entry.beschreibung).toContain('Sandsäcke:');
    // Der Eintrag ist eine Anforderung: Die Menge mit Reserve steht zuerst.
    expect(entry.beschreibung).toMatch(/Sandsäcke: \d+ anfordern/);
    expect(entry.beschreibung).not.toContain('verbaut');
    expect(entry.beschreibung).toContain('Paletten:');
    expect(entry.beschreibung).toContain('LKW-Fuhren gefüllte Säcke:');
    // Nur ein Abschnitt: Die Summe wäre eine Wiederholung.
    expect(entry.beschreibung).not.toContain('Summe über');
  });

  it('summiert über alle Dammabschnitte der Lage', () => {
    linien.mockReturnValue([
      line(),
      line({ id: 'linie-2', name: 'Hofeinfahrt', dammHoehe: 0.5 }),
    ]);
    renderWithIntl(<DammbauPanel item={line()} open onClose={() => {}} />);

    expect(screen.getByText(/2 Abschnitte/)).toBeInTheDocument();
    expect(Number(/(\d+)/.exec(wert('Säcke gesamt'))?.[1] ?? 0)).toBeGreaterThan(
      saecke()
    );
  });

  it('schaltet den Rechner an dieser Linie wieder ab', async () => {
    const user = userEvent.setup();
    renderWithIntl(<DammbauPanel item={line()} open onClose={() => {}} />);

    await user.click(
      screen.getByLabelText('Diese Linie als Dammlinie rechnen')
    );

    await waitFor(() =>
      expect(screen.queryByText('Dammlänge')).toBeNull()
    );
    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(updateItem.mock.calls[0][0]).toMatchObject({ dammbau: 'false' });
  });

  it('meldet, wenn für die Linie noch keine Strecke gezeichnet ist', () => {
    renderWithIntl(
      <DammbauPanel
        item={line({ positions: JSON.stringify([start]) })}
        open
        onClose={() => {}}
      />
    );
    expect(
      screen.getByText(/noch keine Strecke gezeichnet/)
    ).toBeInTheDocument();
  });
});
