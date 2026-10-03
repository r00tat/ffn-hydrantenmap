// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSyncErrors,
  getSyncErrors,
  recordSyncError,
} from '../../lib/syncErrors';
import { renderWithIntl } from '../../test-utils/intlRender';
import SyncErrorsChip from './SyncErrorsChip';

const denied = () =>
  Object.assign(new Error('Missing or insufficient permissions.'), {
    code: 'permission-denied',
  });

describe('SyncErrorsChip', () => {
  afterEach(() => {
    act(() => clearSyncErrors());
  });

  it('zeigt nichts, solange nichts abgelehnt wurde', () => {
    const { container } = renderWithIntl(<SyncErrorsChip />);
    expect(container).toBeEmptyDOMElement();
  });

  it('nennt die Zahl der abgelehnten Änderungen', () => {
    renderWithIntl(<SyncErrorsChip />);
    act(() => {
      recordSyncError({ kind: 'add', path: 'call/1/item/a', error: denied() });
      recordSyncError({ kind: 'update', path: 'call/1/item/b', error: denied() });
    });
    expect(
      screen.getByText('2 Änderungen nicht übertragen'),
    ).toBeInTheDocument();
  });

  it('öffnet beim Antippen die Einzelheiten mit Pfad, Art und Fehlercode', () => {
    act(() => {
      recordSyncError({ kind: 'update', path: 'call/1/item/b', error: denied() });
    });
    renderWithIntl(<SyncErrorsChip />);

    fireEvent.click(screen.getByText('1 Änderung nicht übertragen'));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('call/1/item/b')).toBeInTheDocument();
    expect(within(dialog).getByText(/Ändern/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Fehlercode: permission-denied/),
    ).toBeInTheDocument();
  });

  it('versucht es auf Wunsch erneut und nimmt den Eintrag aus der Liste', () => {
    const retry = vi.fn();
    act(() => {
      recordSyncError({ kind: 'set', path: 'call/1', error: denied(), retry });
    });
    renderWithIntl(<SyncErrorsChip />);
    fireEvent.click(screen.getByText('1 Änderung nicht übertragen'));

    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(getSyncErrors()).toHaveLength(0);
  });

  it('bietet keine Wiederholung an, wo es keine gibt', () => {
    act(() => {
      recordSyncError({ kind: 'batch', path: 'Import', error: denied() });
    });
    renderWithIntl(<SyncErrorsChip />);
    fireEvent.click(screen.getByText('1 Änderung nicht übertragen'));

    expect(
      screen.queryByRole('button', { name: 'Erneut versuchen' }),
    ).not.toBeInTheDocument();
  });

  it('verwirft einzelne und alle Einträge', () => {
    act(() => {
      recordSyncError({ kind: 'set', path: 'a', error: denied() });
      recordSyncError({ kind: 'set', path: 'b', error: denied() });
      recordSyncError({ kind: 'set', path: 'c', error: denied() });
    });
    renderWithIntl(<SyncErrorsChip />);
    fireEvent.click(screen.getByText('3 Änderungen nicht übertragen'));

    fireEvent.click(screen.getAllByRole('button', { name: 'Verwerfen' })[0]);
    expect(getSyncErrors().map((e) => e.path)).toEqual(['b', 'c']);

    fireEvent.click(screen.getByRole('button', { name: 'Alle verwerfen' }));
    expect(getSyncErrors()).toHaveLength(0);
  });
});
