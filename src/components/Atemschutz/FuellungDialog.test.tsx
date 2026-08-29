// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Der Mangel-Zweig zieht die Server-Action und den Storage-Upload nach sich —
// beide sind im Test nicht ladbar. Dieselben Attrappen wie im MangelDialog.
const { createAtemschutzMangelMock, uploadMangelImageMock } = vi.hoisted(() => ({
  createAtemschutzMangelMock: vi.fn(),
  uploadMangelImageMock: vi.fn(),
}));

vi.mock('./atemschutzActions', () => ({
  createAtemschutzMangel: createAtemschutzMangelMock,
}));

vi.mock('../Fahrtenbuch/uploadMangelImage', () => ({
  uploadMangelImage: uploadMangelImageMock,
}));

import { renderWithIntl } from '../../test-utils/intlRender';
import type { AtemschutzGeraet } from '../../common/atemschutz';
import FuellungDialog from './FuellungDialog';

function flasche(over: Partial<AtemschutzGeraet> = {}): AtemschutzGeraet {
  return {
    id: 'f1',
    typ: 'flasche',
    bezeichnung: 'Atemluftflasche Stahl 6 l',
    feuerwehr: 'Neusiedl am See',
    nummer: '2.16.19',
    nenndruck: 200,
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

function render(props: Partial<React.ComponentProps<typeof FuellungDialog>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  renderWithIntl(
    <FuellungDialog
      open
      groupId="g1"
      flaschen={[flasche()]}
      feuerwehren={['Neusiedl am See', 'Jois']}
      personSuggestions={['Max Muster']}
      defaultGefuelltVon="Max Muster"
      onClose={vi.fn()}
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave };
}

/** Wählt den ersten Vorschlag der Flaschenliste aus. */
function waehleFlasche(suchtext: string) {
  const feld = screen.getByLabelText(/Flaschennummer/);
  fireEvent.change(feld, { target: { value: suchtext } });
  fireEvent.keyDown(feld, { key: 'ArrowDown' });
  fireEvent.keyDown(feld, { key: 'Enter' });
}

describe('FuellungDialog', () => {
  beforeEach(() => {
    createAtemschutzMangelMock.mockReset();
    uploadMangelImageMock.mockReset();
  });

  it('setzt 300 bar als Enddruck vor', () => {
    render();
    expect(screen.getByLabelText(/Enddruck/)).toHaveValue(300);
  });

  it('trägt den angemeldeten Benutzer als Füller ein', () => {
    render();
    expect(screen.getByLabelText(/Gefüllt von/)).toHaveValue('Max Muster');
  });

  it('sperrt Speichern ohne Flaschennummer und ohne Feuerwehr', () => {
    render();
    // Beide Felder sind leer — genau der Fall, den validateFuellungInput
    // als `identifierMissing` meldet.
    expect(screen.getByRole('button', { name: /speichern/i })).toBeDisabled();
    expect(
      screen.getByText(/Flaschennummer oder Feuerwehr/),
    ).toBeInTheDocument();
  });

  it('gibt Speichern frei, sobald eine Feuerwehr eingetragen ist', () => {
    render();
    fireEvent.change(screen.getByLabelText(/Feuerwehr/), {
      target: { value: 'Jois' },
    });
    expect(screen.getByRole('button', { name: /speichern/i })).toBeEnabled();
  });

  it('meldet einen Startdruck über dem Enddruck', () => {
    render();
    fireEvent.change(screen.getByLabelText(/Feuerwehr/), {
      target: { value: 'Jois' },
    });
    fireEvent.change(screen.getByLabelText(/Startdruck/), {
      target: { value: '310' },
    });
    expect(screen.getByText(/Startdruck liegt über/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /speichern/i })).toBeDisabled();
  });

  it('zeigt den Scan-Knopf', () => {
    render();
    expect(
      screen.getByRole('button', { name: /barcode scannen/i }),
    ).toBeInTheDocument();
  });

  it('übernimmt beim Bearbeiten die gespeicherten Werte', () => {
    render({
      fuellung: {
        id: 'x1',
        anzahl: 5,
        enddruck: 200,
        gefuelltVon: 'Anna Beispiel',
        feuerwehr: 'Jois',
        zeitpunkt: '2026-08-29T10:00:00.000Z',
        createdAt: '',
        createdBy: '',
        updatedAt: '',
        updatedBy: '',
      },
    });
    expect(screen.getByLabelText(/Anzahl/)).toHaveValue(5);
    expect(screen.getByLabelText(/Enddruck/)).toHaveValue(200);
    expect(screen.getByLabelText(/Gefüllt von/)).toHaveValue('Anna Beispiel');
  });
});

describe('FuellungDialog — gewählte Flasche', () => {
  beforeEach(() => {
    createAtemschutzMangelMock.mockReset();
    uploadMangelImageMock.mockReset();
  });

  it('trägt die Inventarnummer ein, wenn die Flasche keine eigene Nummer hat', () => {
    // Vorher stand hier die Bezeichnung — im Protokoll nicht von der
    // Nachbarflasche desselben Typs zu unterscheiden.
    render({
      flaschen: [
        flasche({
          id: 'f2',
          nummer: undefined,
          inventarNr: '2016-FL-003',
          bezeichnung: 'Atemluftflasche CFK 6,8 l',
        }),
      ],
    });
    waehleFlasche('CFK');
    expect(screen.getByLabelText(/Flaschennummer/)).toHaveValue('2016-FL-003');
  });

  it('zeigt die gewählte Flasche groß mit Kennung, Bezeichnung und Wehr', () => {
    render();
    waehleFlasche('2.16');
    // Die Kennung als Überschrift, darunter Bezeichnung und Feuerwehr — am
    // Sammelplatz muss das im Stehen lesbar sein.
    expect(
      screen.getByRole('heading', { name: '2.16.19' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Atemluftflasche Stahl 6 l')).toBeInTheDocument();
    expect(screen.getByText(/Neusiedl am See/)).toBeInTheDocument();
  });

  it('blendet die Anzahl aus, sobald eine Flaschennummer dasteht', () => {
    // Die Anzahl ist die Sammelerfassung für Flaschen ohne Nummer.
    render();
    expect(screen.getByLabelText(/Anzahl/)).toBeInTheDocument();
    waehleFlasche('2.16');
    expect(screen.queryByLabelText(/Anzahl/)).not.toBeInTheDocument();
  });

  it('speichert eine benannte Flasche als genau eine', async () => {
    const { onSave } = render();
    waehleFlasche('2.16');
    fireEvent.click(screen.getByRole('button', { name: /speichern/i }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ anzahl: 1, flaschenNummer: '2.16.19' }),
      ),
    );
  });

  it('übernimmt bei Enter einen exakt getroffenen Code', () => {
    // Der externe Handscanner tippt den Code und schickt ein Enter hinterher.
    render();
    const feld = screen.getByLabelText(/Flaschennummer/);
    fireEvent.change(feld, { target: { value: '2.16.19' } });
    fireEvent.keyDown(feld, { key: 'Enter' });
    expect(screen.getByRole('heading', { name: '2.16.19' })).toBeInTheDocument();
  });
});

describe('FuellungDialog — Mangel aus der Sichtkontrolle', () => {
  beforeEach(() => {
    createAtemschutzMangelMock.mockReset();
    uploadMangelImageMock.mockReset();
  });

  function setzeMangel() {
    fireEvent.mouseDown(screen.getByLabelText(/Sichtkontrolle/));
    fireEvent.click(screen.getByRole('option', { name: 'Mangel' }));
  }

  it('verlangt eine Beschreibung, sobald „Mangel“ gewählt ist', () => {
    render();
    waehleFlasche('2.16');
    setzeMangel();
    expect(
      screen.getByLabelText(/Was ist der Mangel/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /speichern/i })).toBeDisabled();
  });

  it('legt den Mangel an und hängt seine ID an die Füllung', async () => {
    createAtemschutzMangelMock.mockResolvedValue({ success: true, id: 'm7' });
    const { onSave } = render();
    waehleFlasche('2.16');
    setzeMangel();
    fireEvent.change(screen.getByLabelText(/Was ist der Mangel/), {
      target: { value: 'Ventil undicht' },
    });
    fireEvent.click(screen.getByRole('button', { name: /speichern/i }));

    await waitFor(() =>
      expect(createAtemschutzMangelMock).toHaveBeenCalledWith('g1', {
        geraetId: 'f1',
        description: 'Ventil undicht',
        images: [],
      }),
    );
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ mangelId: 'm7', sichtkontrolle: 'mangel' }),
      ),
    );
  });

  it('erklärt bei einer Fremdflasche, warum kein Mangel möglich ist', () => {
    render();
    // Freitext statt Auswahl: Zu dieser Flasche gibt es keinen Stammdatensatz.
    fireEvent.change(screen.getByLabelText(/Flaschennummer/), {
      target: { value: '9.99.99' },
    });
    setzeMangel();
    expect(screen.getByText(/nur an einer Flasche aus den Stammdaten/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Was ist der Mangel/)).not.toBeInTheDocument();
    // Die Füllung selbst bleibt speicherbar — der Zustand gehört in die
    // Bemerkung, aber die Zeile darf nicht verloren gehen.
    expect(screen.getByRole('button', { name: /speichern/i })).toBeEnabled();
  });
});
