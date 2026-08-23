// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import type { Firecall, Line } from '../firebase/firestore';

let firecall: Firecall = { id: 'einsatz-1', name: 'Hochwasser Seestraße' };
vi.mock('../../hooks/useFirecall', () => ({
  useFirecall: () => firecall,
  useFirecallId: () => firecall.id,
}));

let linien: Line[] = [];
vi.mock('../../hooks/useDammLinien', () => ({
  default: () => linien,
}));

// Die Karte selbst ist Leaflet und gehört nicht in diesen Test. Der Stub reicht
// durch, was die Seite von ihr braucht: die Auswahl einer Dammlinie.
vi.mock('../Map/Damm/DammMap', () => ({
  default: ({
    linien: items,
    selectedId,
    onSelect,
  }: {
    linien: Line[];
    selectedId?: string;
    onSelect: (id: string) => void;
  }) => (
    <div data-testid="karte" data-selected={selectedId ?? ''}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id as string)}
        >
          {`Karte: ${item.name}`}
        </button>
      ))}
    </div>
  ),
}));

// Der Rechner ist über die Panel-Tests abgedeckt; hier zählt nur, für welchen
// Abschnitt er gezeigt wird.
vi.mock('../Map/Damm/SandsackRechner', () => ({
  default: ({ item }: { item: Line }) => (
    <div data-testid="rechner">{`Rechner für ${item.name}`}</div>
  ),
}));

const setIsDrawing = vi.fn();
const setFirecallItem = vi.fn();
let leitungen = {
  isDrawing: false,
  setIsDrawing,
  setFirecallItem,
  firecallItem: undefined as Line | undefined,
  complete: vi.fn(),
  lastCreatedId: undefined as string | undefined,
};
vi.mock('../Map/Leitungen/context', () => ({
  LeitungsProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useLeitungen: () => leitungen,
}));

import Dammbau from './Dammbau';

const line = (overrides: Partial<Line> = {}): Line =>
  ({
    id: 'linie-1',
    type: 'line',
    name: 'Uferstraße',
    lat: 47.9482,
    lng: 16.8482,
    destLat: 47.9482 + 200 / 111_320,
    destLng: 16.8482,
    positions: JSON.stringify([
      [47.9482, 16.8482],
      [47.9482 + 200 / 111_320, 16.8482],
    ]),
    distance: 200,
    dammbau: 'true',
    ...overrides,
  }) as Line;

describe('Dammbau', () => {
  beforeEach(() => {
    firecall = { id: 'einsatz-1', name: 'Hochwasser Seestraße' };
    linien = [];
    setIsDrawing.mockClear();
    setFirecallItem.mockClear();
    leitungen = {
      isDrawing: false,
      setIsDrawing,
      setFirecallItem,
      firecallItem: undefined,
      complete: vi.fn(),
      lastCreatedId: undefined,
    };
  });

  it('verweist ohne laufenden Einsatz auf die Einsatzauswahl', () => {
    firecall = { id: 'unknown', name: '' };
    renderWithIntl(<Dammbau />);

    expect(screen.getByText(/braucht es einen laufenden Einsatz/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Zur Einsatzauswahl' })
    ).toHaveAttribute('href', '/einsaetze');
    expect(screen.queryByTestId('karte')).toBeNull();
  });

  it('sagt, dass noch keine Dammlinie gezeichnet ist', () => {
    renderWithIntl(<Dammbau />);
    expect(screen.getByText(/noch keine Dammlinie gezeichnet/)).toBeInTheDocument();
    expect(screen.getByText(/in der Liste oder auf der Karte wählen/)).toBeInTheDocument();
  });

  it('listet die Dammlinien mit Länge und Bedarf', () => {
    linien = [line(), line({ id: 'linie-2', name: 'Hofeinfahrt' })];
    renderWithIntl(<Dammbau />);

    expect(screen.getByText('Uferstraße')).toBeInTheDocument();
    expect(screen.getByText('Hofeinfahrt')).toBeInTheDocument();
    // Die Zusammenfassung steht als Zweitzeile am Eintrag.
    expect(screen.getAllByText(/Sandsäcke/).length).toBeGreaterThan(0);
  });

  it('kennzeichnet eine Linie ohne aktiven Rechner', () => {
    linien = [line({ dammbau: undefined })];
    renderWithIntl(<Dammbau />);
    expect(screen.getByText('nicht gerechnet')).toBeInTheDocument();
  });

  it('zeigt den Rechner für die in der Liste gewählte Dammlinie', async () => {
    const user = userEvent.setup();
    linien = [line(), line({ id: 'linie-2', name: 'Hofeinfahrt' })];
    renderWithIntl(<Dammbau />);

    expect(screen.queryByTestId('rechner')).toBeNull();
    await user.click(screen.getByText('Hofeinfahrt'));
    expect(screen.getByTestId('rechner')).toHaveTextContent(
      'Rechner für Hofeinfahrt'
    );
  });

  it('übernimmt die Auswahl von der Karte', async () => {
    const user = userEvent.setup();
    linien = [line()];
    renderWithIntl(<Dammbau />);

    await user.click(screen.getByRole('button', { name: 'Karte: Uferstraße' }));
    expect(screen.getByTestId('rechner')).toHaveTextContent(
      'Rechner für Uferstraße'
    );
  });

  it('startet das Zeichnen mit einer eingeschalteten Dammlinie als Vorlage', async () => {
    const user = userEvent.setup();
    renderWithIntl(<Dammbau />);

    await user.click(
      screen.getByRole('button', { name: 'Dammlinie einzeichnen' })
    );

    expect(setFirecallItem).toHaveBeenCalledTimes(1);
    expect(setFirecallItem.mock.calls[0][0]).toMatchObject({
      type: 'line',
      // Wer zum Rechnen zeichnet, will das Ergebnis sehen, nicht erst einen
      // Schalter finden.
      dammbau: 'true',
    });
    expect(setIsDrawing).toHaveBeenCalledWith(true);
  });

  it('zeigt im Zeichenmodus den Hinweis samt Abbrechen', async () => {
    const user = userEvent.setup();
    leitungen = { ...leitungen, isDrawing: true };
    renderWithIntl(<Dammbau />);

    expect(screen.getByText(/Punkte auf der Karte setzen/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zeichnen abbrechen' }));
    expect(setIsDrawing).toHaveBeenCalledWith(false);
  });

  it('wählt eine neu gezeichnete Dammlinie von selbst aus', () => {
    linien = [line(), line({ id: 'linie-2', name: 'Hofeinfahrt' })];
    leitungen = { ...leitungen, lastCreatedId: 'linie-2' };
    renderWithIntl(<Dammbau />);

    expect(screen.getByTestId('rechner')).toHaveTextContent(
      'Rechner für Hofeinfahrt'
    );
  });

  it('nennt den Gesamtbedarf, sobald es mehr als einen Abschnitt gibt', () => {
    linien = [line(), line({ id: 'linie-2', name: 'Hofeinfahrt' })];
    renderWithIntl(<Dammbau />);

    expect(screen.getByText('Gesamtbedarf aller Abschnitte')).toBeInTheDocument();
    expect(screen.getByText(/2 Abschnitte/)).toBeInTheDocument();
  });

  it('nennt die Summe der benötigten Kräfte über alle Abschnitte', () => {
    // Zwei Abschnitte mit je 12 Kräften (Vorbelegung) sind 24 nachzufordern.
    linien = [line(), line({ id: 'linie-2', name: 'Hofeinfahrt' })];
    renderWithIntl(<Dammbau />);

    expect(screen.getByText('24 Kräfte')).toBeInTheDocument();
  });

  it('summiert auch die Kräfte, die aus einer Zielzeit gerechnet sind', () => {
    linien = [
      line({ dammPersonal: 10 }),
      line({
        id: 'linie-2',
        name: 'Hofeinfahrt',
        dammVorgabe: 'zeit',
        dammZielzeit: 4,
        // Bei Vorgabe der Zeit zählt nicht dieser Wert, sondern der gerechnete.
        dammPersonal: 1,
      }),
    ];
    renderWithIntl(<Dammbau />);

    const kraefte = Number(
      /(\d+) Kräfte/.exec(document.body.textContent ?? '')?.[1] ?? 0
    );
    expect(kraefte).toBeGreaterThan(11);
  });

  it('lässt den Gesamtbedarf bei einem einzigen Abschnitt weg', () => {
    linien = [line()];
    renderWithIntl(<Dammbau />);
    expect(screen.queryByText('Gesamtbedarf aller Abschnitte')).toBeNull();
  });
});
