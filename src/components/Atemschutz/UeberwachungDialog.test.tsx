// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PA_SAETZE, type AtemschutzTrupp } from '../../common/atemschutz';
import { renderWithIntl } from '../../test-utils/intlRender';
import UeberwachungDialog from './UeberwachungDialog';

function trupp(over: Partial<AtemschutzTrupp> = {}): AtemschutzTrupp {
  return {
    id: 't1',
    truppKey: 'k1',
    laufendeNummer: 1,
    truppName: 'Trupp 1',
    feuerwehr: 'Neusiedl am See',
    mitglieder: ['Franz Beispiel', 'Anna Beispiel'],
    status: 'bereit',
    bereitSeit: '2026-09-02T10:00:00.000Z',
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

function render(
  props: Partial<React.ComponentProps<typeof UeberwachungDialog>> = {},
) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  renderWithIntl(
    <UeberwachungDialog
      open
      trupp={trupp()}
      vorgabe={PA_SAETZE.standard300}
      personSuggestions={['Franz Beispiel', 'Anna Beispiel']}
      einheitVorschlaege={['RLFA-ND', 'TLFA']}
      istUebernahme
      onClose={vi.fn()}
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave };
}

describe('UeberwachungDialog', () => {
  it('führt jeden Namensvorschlag nur einmal', async () => {
    // Die Aufrufer setzen die Liste aus Truppmitgliedern, eigenem Namen und den
    // Personen der Gruppe zusammen — die überschneiden sich. Der Name ist der
    // Schlüssel der Option; doppelt darin warnt React und verschluckt Einträge.
    render({
      personSuggestions: [
        'Franz Beispiel',
        'Franz Beispiel',
        ' franz beispiel ',
        'Anna Beispiel',
      ],
    });
    const feld = screen.getByLabelText(/Überwachung durch/);
    fireEvent.focus(feld);
    fireEvent.keyDown(feld, { key: 'ArrowDown' });
    expect(
      screen.getAllByRole('option', { name: 'Franz Beispiel' }),
    ).toHaveLength(1);
  });

  it('erklärt bei der Übernahme, was sie bewirkt', () => {
    render();
    // Titel und Knopf tragen denselben Text — hier zählt die Überschrift.
    expect(
      screen.getByRole('heading', { name: 'Trupp übernehmen' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/übernimmt dieses Gerät die Einsatzzeitkontrolle/),
    ).toBeInTheDocument();
    // Die Abgrenzung der Unterlage: Die Verantwortung bleibt beim Trupp.
    expect(
      screen.getByText(/Verantwortung für den Trupp bleibt/),
    ).toBeInTheDocument();
  });

  it('erklärt beim Bearbeiten nichts mehr', () => {
    render({ istUebernahme: false });
    expect(
      screen.getByRole('heading', { name: 'Überwachung bearbeiten' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/übernimmt dieses Gerät/)).toBeNull();
  });

  it('gibt die taktische Einheit mit', async () => {
    const { onSave } = render();
    fireEvent.change(screen.getByLabelText(/Taktische Einheit/), {
      target: { value: 'RLFA-ND' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trupp übernehmen' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].entsendetAn).toBe('RLFA-ND');
  });
});

describe('UeberwachungDialog: Auftrag', () => {
  it('gibt einen nachgetragenen Auftrag heraus', async () => {
    // Ein Trupp kann ohne Auftrag losgeschickt worden sein; dann steht er
    // hier — im Tagebuch bleibt es beim knappen Satz des Abmarschs.
    const { onSave } = render();
    fireEvent.change(screen.getByLabelText(/^Auftrag/), {
      target: { value: 'Brandbekämpfung' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trupp übernehmen' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].auftrag).toBe('Brandbekämpfung');
  });
});
