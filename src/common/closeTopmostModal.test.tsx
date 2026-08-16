// @vitest-environment jsdom
import Dialog from '@mui/material/Dialog';
import Drawer from '@mui/material/Drawer';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { closeTopmostModal } from './closeTopmostModal';

function DialogHarness({
  ignoreEscape = false,
}: {
  ignoreEscape?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => {
        if (ignoreEscape && reason === 'escapeKeyDown') return;
        setOpen(false);
      }}
    >
      <div>Dialog-Inhalt</div>
    </Dialog>
  );
}

function DrawerHarness() {
  const [open, setOpen] = useState(true);
  return (
    <Drawer anchor="left" open={open} onClose={() => setOpen(false)}>
      <div>Drawer-Inhalt</div>
    </Drawer>
  );
}

function StackedHarness() {
  const [dialogOpen, setDialogOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(true);
  return (
    <>
      <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <div>Drawer-Inhalt</div>
      </Drawer>
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <div>Dialog-Inhalt</div>
      </Dialog>
    </>
  );
}

describe('closeTopmostModal', () => {
  it('reports nothing to close when no overlay is open', () => {
    render(<div>nur Seiteninhalt</div>);
    expect(closeTopmostModal()).toBe(false);
  });

  it('closes an open dialog', async () => {
    render(<DialogHarness />);
    expect(screen.getByText('Dialog-Inhalt')).toBeInTheDocument();

    expect(closeTopmostModal()).toBe(true);

    await waitFor(() =>
      expect(screen.queryByText('Dialog-Inhalt')).not.toBeInTheDocument(),
    );
  });

  it('closes an open drawer', async () => {
    render(<DrawerHarness />);
    expect(screen.getByText('Drawer-Inhalt')).toBeInTheDocument();

    expect(closeTopmostModal()).toBe(true);

    await waitFor(() =>
      expect(screen.queryByText('Drawer-Inhalt')).not.toBeInTheDocument(),
    );
  });

  it('closes only the topmost overlay when several are stacked', async () => {
    render(<StackedHarness />);

    expect(closeTopmostModal()).toBe(true);

    await waitFor(() =>
      expect(screen.queryByText('Dialog-Inhalt')).not.toBeInTheDocument(),
    );
    // Der darunterliegende Drawer bleibt offen — ein Zurück-Druck schließt
    // genau eine Ebene.
    expect(screen.getByText('Drawer-Inhalt')).toBeInTheDocument();
  });

  it('swallows the press for a dialog that refuses to close on escape', async () => {
    render(<DialogHarness ignoreEscape />);

    // Der Dialog verweigert das Schließen bewusst (z.B. ungespeicherte
    // Eingaben). Trotzdem gilt der Druck als behandelt, sonst würde er
    // durchfallen und die App beenden.
    expect(closeTopmostModal()).toBe(true);

    await act(async () => {});
    expect(screen.getByText('Dialog-Inhalt')).toBeInTheDocument();
  });
});
