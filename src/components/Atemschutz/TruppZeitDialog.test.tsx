// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import TruppZeitDialog from './TruppZeitDialog';

function render(
  props: Partial<React.ComponentProps<typeof TruppZeitDialog>> = {},
) {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  renderWithIntl(
    <TruppZeitDialog
      open
      modus="entsenden"
      entsendetAnVorschlaege={['RLFA 2000', 'KDOF', 'Anna Huber']}
      onClose={vi.fn()}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onConfirm };
}

describe('TruppZeitDialog', () => {
  it('entsendet auch ohne Angabe eines Ziels', async () => {
    // Am Sammelplatz steht oft nur fest, *dass* der Trupp abmarschiert.
    const { onConfirm } = render();
    fireEvent.click(screen.getByRole('button', { name: /entsenden/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][0]).not.toHaveProperty('entsendetAn');
    expect(onConfirm.mock.calls[0][0].status).toBe('imEinsatz');
  });

  it('schlägt die Fahrzeuge des Einsatzes vor', () => {
    render();
    const feld = screen.getByLabelText(/Entsendet an/);
    fireEvent.focus(feld);
    fireEvent.keyDown(feld, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'RLFA 2000' })).toBeInTheDocument();
  });

  it('übernimmt ein frei eingetragenes Ziel', async () => {
    const { onConfirm } = render();
    fireEvent.change(screen.getByLabelText(/Entsendet an/), {
      target: { value: 'Abschnitt Ost' },
    });
    fireEvent.click(screen.getByRole('button', { name: /entsenden/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][0].entsendetAn).toBe('Abschnitt Ost');
  });

  it('übernimmt beim Entsenden die Vorbelegung der vorigen Bereitstellung', async () => {
    const { onConfirm } = render({ entsendetAnVorschlag: 'KDOF' });
    fireEvent.click(screen.getByRole('button', { name: /entsenden/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][0].entsendetAn).toBe('KDOF');
  });

  it('zeigt bei der Rückkehr kein Zielfeld', () => {
    render({ modus: 'rueckkehr' });
    expect(screen.queryByLabelText(/Entsendet an/)).not.toBeInTheDocument();
  });

  it('fragt bei der Überwachung nicht nach einem Ziel', () => {
    // Der Gruppenkommandant schickt den Trupp in *seinen* Einsatz — es gibt
    // niemanden, an den er ihn übergibt.
    render({ kontext: 'ueberwachung' });
    expect(screen.queryByLabelText(/Entsendet an/)).toBeNull();
  });

  it('beschriftet bei der Überwachung als „in den Einsatz schicken"', () => {
    render({ kontext: 'ueberwachung' });
    expect(
      screen.getByRole('button', { name: 'In den Einsatz schicken' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Trupp in den Einsatz schicken'),
    ).toBeInTheDocument();
  });

  it('löscht bei der Überwachung ein am Sammelplatz gesetztes Ziel nicht', async () => {
    // `entsendePatch` lässt das Feld aus dem Patch weg, wenn es fehlt — der
    // bestehende Wert am Dokument bleibt damit stehen.
    const { onConfirm } = render({
      kontext: 'ueberwachung',
      entsendetAnVorschlag: 'RLFA 2000',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'In den Einsatz schicken' }),
    );
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][0]).not.toHaveProperty('entsendetAn');
  });
});
