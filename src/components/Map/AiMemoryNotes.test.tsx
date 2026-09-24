// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { addNote, loadMemory } from '../../hooks/aiAssistant/assistantMemory';
import AiMemoryNotes from './AiMemoryNotes';

describe('AiMemoryNotes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('bleibt unsichtbar, solange nichts gemerkt ist', () => {
    renderWithIntl(<AiMemoryNotes firecallId="e1" />);
    expect(screen.queryByRole('button', { name: /Notiz/ })).toBeNull();
  });

  it('zeigt eine neue Notiz sofort an und löscht sie wieder', async () => {
    renderWithIntl(<AiMemoryNotes firecallId="e1" />);
    act(() => {
      addNote('e1', 'Messwerte: Trupp 1, Ebene 7');
    });

    await userEvent.click(screen.getByRole('button', { name: /Notiz/ }));
    expect(screen.getByText('Messwerte: Trupp 1, Ebene 7')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Vergessen' }));
    expect(loadMemory('e1').notes).toEqual([]);
  });

  it('vergisst auf Wunsch alles', async () => {
    addNote('e1', 'Ebene 7');
    addNote('e1', 'Trupp 1');
    renderWithIntl(<AiMemoryNotes firecallId="e1" />);

    await userEvent.click(screen.getByRole('button', { name: /Notiz/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Alle vergessen' }));
    expect(loadMemory('e1').notes).toEqual([]);
  });
});
