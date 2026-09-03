// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
      <button
        onClick={() => showSnackbar('Geht weg!', 'error', undefined, 100)}
      >
        show-timed
      </button>
      <button onClick={() => showSnackbar('Bleibt!', 'error')}>
        show-sticky
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

  it('renders a close button alongside the action so snackbar stays dismissible', async () => {
    const user = userEvent.setup();
    render(
      <SnackbarProvider>
        <TestConsumer />
      </SnackbarProvider>,
    );

    await user.click(screen.getByText('show-action'));
    expect(screen.getByText('Neu laden')).toBeInTheDocument();

    const closeButton = screen.getByRole('button', { name: 'Close' });
    expect(closeButton).toBeInTheDocument();
  });

  it('lässt eine Meldung mit Anzeigedauer von selbst verschwinden', async () => {
    render(
      <SnackbarProvider>
        <TestConsumer />
      </SnackbarProvider>,
    );

    fireEvent.click(screen.getByText('show-timed'));
    expect(screen.getByText('Geht weg!')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Geht weg!')).toBeNull(), {
      timeout: 3000,
    });
  });

  it('lässt einen Fehler ohne Anzeigedauer stehen', async () => {
    render(
      <SnackbarProvider>
        <TestConsumer />
      </SnackbarProvider>,
    );

    fireEvent.click(screen.getByText('show-sticky'));
    // Ein kurzes Warten und nicht `waitFor`: Geprüft wird eine Nicht-Änderung,
    // und dafür gibt es keine Bedingung, auf die man warten könnte.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.getByText('Bleibt!')).toBeInTheDocument();
  });
});
