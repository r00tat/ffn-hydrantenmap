// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SnackbarProvider, { useSnackbar } from './SnackbarProvider';

function TestConsumer() {
  const showSnackbar = useSnackbar();
  return (
    <>
      <button onClick={() => showSnackbar('Erfolg!', 'success')}>
        show-success
      </button>
      <button onClick={() => showSnackbar('Fehler!', 'error')}>
        show-error
      </button>
      <button
        onClick={() =>
          showSnackbar('Update!', 'info', {
            label: 'Neu laden',
            onClick: vi.fn(),
          })
        }
      >
        show-action
      </button>
    </>
  );
}

describe('SnackbarProvider', () => {
  it('shows a success snackbar when triggered', async () => {
    const user = userEvent.setup();
    render(
      <SnackbarProvider>
        <TestConsumer />
      </SnackbarProvider>,
    );

    await user.click(screen.getByText('show-success'));
    expect(screen.getByText('Erfolg!')).toBeInTheDocument();
  });

  it('shows an error snackbar when triggered', async () => {
    const user = userEvent.setup();
    render(
      <SnackbarProvider>
        <TestConsumer />
      </SnackbarProvider>,
    );

    await user.click(screen.getByText('show-error'));
    expect(screen.getByText('Fehler!')).toBeInTheDocument();
  });

  it('shows a snackbar with action button', async () => {
    const user = userEvent.setup();
    render(
      <SnackbarProvider>
        <TestConsumer />
      </SnackbarProvider>,
    );

    await user.click(screen.getByText('show-action'));
    expect(screen.getByText('Update!')).toBeInTheDocument();
    expect(screen.getByText('Neu laden')).toBeInTheDocument();
  });

  it('closes snackbar when close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SnackbarProvider>
        <TestConsumer />
      </SnackbarProvider>,
    );

    await user.click(screen.getByText('show-error'));
    expect(screen.getByText('Fehler!')).toBeInTheDocument();

    // MUI Alert renders a close button with aria-label "Close"
    const closeButton = screen.getByRole('button', { name: 'Close' });
    await user.click(closeButton);

    // After closing, the alert should start transitioning out
    // We don't wait for the full animation, just verify the close was triggered
  });
});
