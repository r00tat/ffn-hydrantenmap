// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Mangel } from '../../common/mangel';
import { renderWithIntl } from '../../test-utils/intlRender';
import MangelList from './MangelList';

function mangel(overrides: Partial<Mangel> = {}): Mangel {
  return {
    id: 'm1',
    vehicleId: 'v1',
    vehicleName: 'RLFA 2000',
    description: 'Blinker hinten links defekt',
    status: 'open',
    notes: [],
    reportedAt: '2026-08-01T08:00:00.000Z',
    reportedBy: 'u9',
    reportedByName: 'Bernd Beispiel',
    group: 'ffnd',
    createdAt: '2026-08-01T08:00:00.000Z',
    createdBy: 'u9',
    updatedAt: '2026-08-01T08:00:00.000Z',
    updatedBy: 'u9',
    ...overrides,
  };
}

describe('MangelList', () => {
  it('zeigt Fahrzeug, Beschreibung, Status und Melder', () => {
    renderWithIntl(<MangelList mangel={[mangel()]} onEdit={vi.fn()} />);
    expect(screen.getByText('RLFA 2000')).toBeInTheDocument();
    expect(screen.getByText('Blinker hinten links defekt')).toBeInTheDocument();
    expect(screen.getByText('Offen')).toBeInTheDocument();
    expect(screen.getByText('Bernd Beispiel')).toBeInTheDocument();
  });

  it('zeigt das Behebungsdatum eines behobenen Mangels', () => {
    renderWithIntl(
      <MangelList
        mangel={[
          mangel({ status: 'resolved', resolvedAt: '2026-08-05T09:30:00.000Z' }),
        ]}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('Behoben')).toBeInTheDocument();
    expect(screen.getByText(/05\.08\.26|5\.8\.2026|05\.08\.2026/)).toBeInTheDocument();
  });

  it('weist einen aus einer Fahrt gemeldeten Mangel als solchen aus', () => {
    renderWithIntl(
      <MangelList mangel={[mangel({ entryId: 'e1' })]} onEdit={vi.fn()} />,
    );
    expect(screen.getByText('Aus einer Fahrt gemeldet')).toBeInTheDocument();
  });

  it('zählt die Verlaufseinträge', () => {
    renderWithIntl(
      <MangelList
        mangel={[
          mangel({
            notes: [
              { text: 'a', at: '2026-08-02T00:00:00.000Z', by: 'u1', byName: 'A' },
              { text: 'b', at: '2026-08-03T00:00:00.000Z', by: 'u1', byName: 'A' },
            ],
          }),
        ]}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByText('2 Einträge')).toBeInTheDocument();
  });

  it('blendet die Fahrzeugspalte in einer gefilterten Sicht aus', () => {
    renderWithIntl(
      <MangelList mangel={[mangel()]} hideVehicle onEdit={vi.fn()} />,
    );
    expect(screen.queryByText('RLFA 2000')).not.toBeInTheDocument();
  });

  it('meldet eine leere Liste, statt eine leere Tabelle zu zeigen', () => {
    renderWithIntl(<MangelList mangel={[]} onEdit={vi.fn()} />);
    expect(screen.getByText('Keine Mängel.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('ruft onEdit mit dem Mangel auf', async () => {
    const onEdit = vi.fn();
    const item = mangel();
    renderWithIntl(<MangelList mangel={[item]} onEdit={onEdit} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Mangel bearbeiten' }),
    );
    expect(onEdit).toHaveBeenCalledWith(item);
  });

  it('zeigt den Löschbutton nur mit Handler — Löschen ist Admins vorbehalten', () => {
    const { unmount } = renderWithIntl(
      <MangelList mangel={[mangel()]} onEdit={vi.fn()} />,
    );
    expect(
      screen.queryByRole('button', { name: 'Mangel löschen' }),
    ).not.toBeInTheDocument();
    unmount();

    renderWithIntl(
      <MangelList mangel={[mangel()]} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: 'Mangel löschen' }),
    ).toBeInTheDocument();
  });
});
