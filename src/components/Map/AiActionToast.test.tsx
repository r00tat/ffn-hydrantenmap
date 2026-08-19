// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import AiActionToast, { AiToastState } from './AiActionToast';

vi.mock('../../common/speech', () => ({ speakMessage: vi.fn() }));

const baseState: AiToastState = {
  open: true,
  message: 'Vorschlag: B-Leitung ÜH Hauptstraße 12: 90 m, 5 B-Längen',
  severity: 'success',
};

describe('AiActionToast', () => {
  it('offers Übernehmen and Verwerfen for a hose line draft', async () => {
    const onDraftConfirm = vi.fn();
    const onDraftDiscard = vi.fn();
    renderWithIntl(
      <AiActionToast
        state={{ ...baseState, draftCount: 1 }}
        onClose={vi.fn()}
        onDraftConfirm={onDraftConfirm}
        onDraftDiscard={onDraftDiscard}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(onDraftConfirm).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(onDraftDiscard).toHaveBeenCalledTimes(1);
  });

  it('hides the undo button while a draft is pending', () => {
    renderWithIntl(
      <AiActionToast
        state={{ ...baseState, draftCount: 1, showUndo: true }}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Rückgängig' })
    ).not.toBeInTheDocument();
  });

  it('still shows the undo button without a draft', () => {
    renderWithIntl(
      <AiActionToast
        state={{ ...baseState, showUndo: true }}
        onClose={vi.fn()}
        onUndo={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Rückgängig' })
    ).toBeInTheDocument();
  });

  it('offers a bulk action when several drafts are pending', async () => {
    const onDraftConfirm = vi.fn();
    renderWithIntl(
      <AiActionToast
        state={{ ...baseState, draftCount: 3 }}
        onClose={vi.fn()}
        onDraftConfirm={onDraftConfirm}
        onDraftDiscard={vi.fn()}
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Übernehmen' })
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Alle 3 übernehmen' })
    );
    expect(onDraftConfirm).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Alle verwerfen' })
    ).toBeInTheDocument();
  });

  it('shows no draft buttons for a normal result', () => {
    renderWithIntl(<AiActionToast state={baseState} onClose={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: 'Übernehmen' })
    ).not.toBeInTheDocument();
  });
});
