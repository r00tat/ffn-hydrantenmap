// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import type { Connection, Firecall } from '../firebase/firestore';

let firecall: Firecall = { id: 'einsatz-1', name: 'Brand Musterhof' };
vi.mock('../../hooks/useFirecall', () => ({
  useFirecall: () => firecall,
  useFirecallId: () => firecall.id,
}));

let connections: Connection[] = [];
vi.mock('../../hooks/useConnections', () => ({
  default: () => connections,
}));

// Die Karte selbst ist Leaflet und gehört nicht in diesen Test. Der Stub
// reicht durch, was die Seite von ihr braucht: die Auswahl einer Leitung.
vi.mock('../Map/Leitungen/VersorgungMap', () => ({
  default: ({
    connections: items,
    selectedId,
    onSelect,
  }: {
    connections: Connection[];
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

// Der Rechner ist über die Panel-Tests abgedeckt; hier zählt nur, für welche
// Leitung er gezeigt wird.
vi.mock('../Map/Leitungen/VersorgungRechner', () => ({
  default: ({ item }: { item: Connection }) => (
    <div data-testid="rechner">{`Rechner für ${item.name}`}</div>
  ),
}));

const setIsDrawing = vi.fn();
const setFirecallItem = vi.fn();
let leitungen = {
  isDrawing: false,
  setIsDrawing,
  setFirecallItem,
  firecallItem: undefined as Connection | undefined,
  complete: vi.fn(),
  lastCreatedId: undefined as string | undefined,
};
vi.mock('../Map/Leitungen/context', () => ({
  LeitungsProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useLeitungen: () => leitungen,
}));

import Loeschwasserversorgung from './Loeschwasserversorgung';

const connection = (overrides: Partial<Connection> = {}): Connection =>
  ({
    id: 'leitung-1',
    type: 'connection',
    name: 'Zubringleitung Nord',
    lat: 47.9482,
    lng: 16.8482,
    destLat: 47.9502,
    destLng: 16.8512,
    positions: JSON.stringify([
      [47.9482, 16.8482],
      [47.9502, 16.8512],
    ]),
    distance: 380,
    dimension: 'B',
    ...overrides,
  }) as Connection;

describe('Loeschwasserversorgung', () => {
  beforeEach(() => {
    firecall = { id: 'einsatz-1', name: 'Brand Musterhof' };
    connections = [];
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

  it('verweist ohne Einsatz auf die Einsatzauswahl', () => {
    firecall = { id: 'unknown', name: '' };
    renderWithIntl(<Loeschwasserversorgung />);

    expect(screen.getByText(/braucht es einen laufenden Einsatz/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Zur Einsatzauswahl' })
    ).toHaveAttribute('href', '/einsaetze');
    // Ohne Einsatz keine Karte: Es gibt nichts zu zeichnen, was bliebe.
    expect(screen.queryByTestId('karte')).not.toBeInTheDocument();
  });

  it('sagt es, wenn noch keine Leitung gezeichnet ist', () => {
    renderWithIntl(<Loeschwasserversorgung />);
    expect(screen.getByText(/noch keine Leitung gezeichnet/)).toBeInTheDocument();
    expect(screen.queryByTestId('rechner')).not.toBeInTheDocument();
  });

  it('listet die Leitungen des Einsatzes mit Länge und Dimension', () => {
    connections = [
      connection(),
      connection({ id: 'leitung-2', name: 'Leitung zum Teich', distance: 3400 }),
    ];
    renderWithIntl(<Loeschwasserversorgung />);

    expect(screen.getByText('Zubringleitung Nord')).toBeInTheDocument();
    expect(screen.getByText(/380 m, B/)).toBeInTheDocument();
    expect(screen.getByText('Leitung zum Teich')).toBeInTheDocument();
  });

  it('kennzeichnet Leitungen, für die noch nicht gerechnet wurde', () => {
    connections = [connection()];
    renderWithIntl(<Loeschwasserversorgung />);
    expect(screen.getByText('nicht gerechnet')).toBeInTheDocument();
  });

  it('zeigt den Rechner für die in der Liste gewählte Leitung', async () => {
    const user = userEvent.setup();
    connections = [connection(), connection({ id: 'leitung-2', name: 'Zweite' })];
    renderWithIntl(<Loeschwasserversorgung />);

    expect(screen.getByText(/Eine Leitung in der Liste/)).toBeInTheDocument();

    await user.click(screen.getByText('Zweite'));
    expect(screen.getByTestId('rechner')).toHaveTextContent(
      'Rechner für Zweite'
    );
  });

  it('nimmt die Auswahl auch von der Karte an', async () => {
    const user = userEvent.setup();
    connections = [connection()];
    renderWithIntl(<Loeschwasserversorgung />);

    await user.click(
      screen.getByRole('button', { name: 'Karte: Zubringleitung Nord' })
    );
    expect(screen.getByTestId('rechner')).toHaveTextContent(
      'Rechner für Zubringleitung Nord'
    );
    expect(screen.getByTestId('karte')).toHaveAttribute(
      'data-selected',
      'leitung-1'
    );
  });

  it('startet das Zeichnen mit einer Vorlage, an der der Rechner schon an ist', async () => {
    const user = userEvent.setup();
    renderWithIntl(<Loeschwasserversorgung />);

    await user.click(screen.getByRole('button', { name: /Leitung einzeichnen/ }));

    expect(setFirecallItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'connection',
        // Sonst müsste man den Rechner nach dem Zeichnen erst einschalten.
        foerderung: 'true',
        streetRouting: 'true',
      })
    );
    expect(setIsDrawing).toHaveBeenCalledWith(true);
  });

  it('erklärt das Zeichnen und lässt es abbrechen', async () => {
    const user = userEvent.setup();
    leitungen.isDrawing = true;
    renderWithIntl(<Loeschwasserversorgung />);

    expect(screen.getByText(/Punkte auf der Karte setzen/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Leitung einzeichnen/ })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zeichnen abbrechen' }));
    expect(setIsDrawing).toHaveBeenCalledWith(false);
  });

  it('wählt eine neu gezeichnete Leitung von selbst', () => {
    connections = [connection(), connection({ id: 'neu', name: 'Frisch gezeichnet' })];
    leitungen.lastCreatedId = 'neu';
    renderWithIntl(<Loeschwasserversorgung />);

    expect(screen.getByTestId('rechner')).toHaveTextContent(
      'Rechner für Frisch gezeichnet'
    );
  });

  it('lässt die Auswahl nach dem Zeichnen wieder wandern', async () => {
    // Die neue Leitung wird einmal übernommen — danach gewinnt der Klick, auch
    // wenn `lastCreatedId` stehen bleibt.
    const user = userEvent.setup();
    connections = [connection(), connection({ id: 'neu', name: 'Frisch gezeichnet' })];
    leitungen.lastCreatedId = 'neu';
    renderWithIntl(<Loeschwasserversorgung />);

    await user.click(screen.getByText('Zubringleitung Nord'));
    expect(screen.getByTestId('rechner')).toHaveTextContent(
      'Rechner für Zubringleitung Nord'
    );
  });
});
