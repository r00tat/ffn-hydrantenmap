// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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
      fuellstationen={[]}
      firecallId=""
      onClose={vi.fn()}
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave };
}

function kompressor(id: string): AtemschutzGeraet {
  return {
    id,
    typ: 'fuellstation',
    bezeichnung: `Kompressor ${id}`,
    feuerwehr: 'Neusiedl am See',
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
  };
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

  it('belegt die Sichtkontrolle mit „in Ordnung“ vor', () => {
    // Wer eine Flasche in die Hand nimmt, sieht sie dabei an. Stünde „offen“
    // vorbelegt, wären am Ende fast alle Zeilen „offen“.
    render();
    expect(screen.getByLabelText(/Sichtkontrolle/)).toHaveTextContent(
      'in Ordnung',
    );
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
        firecallId: '',
        verrechnen: false,
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

  it('zeigt bei genau einer Station kein Auswahlfeld, speichert sie aber mit', async () => {
    const { onSave } = render({ fuellstationen: [kompressor('k1')] });

    expect(screen.queryByLabelText('Füllstation')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Flaschennummer/), {
      target: { value: '2.16.19' },
    });
    fireEvent.click(screen.getByRole('button', { name: /speichern/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ fuellstationId: 'k1' }),
      ),
    );
  });

  it('zeigt ohne Station kein Feld und speichert trotzdem', async () => {
    const { onSave } = render({ fuellstationen: [] });

    expect(screen.queryByLabelText('Füllstation')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Flaschennummer/), {
      target: { value: '2.16.19' },
    });
    fireEvent.click(screen.getByRole('button', { name: /speichern/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ fuellstationId: undefined }),
      ),
    );
  });

  it('schaltet verrechnen bei fremder Feuerwehr an der Station ein', () => {
    render({ firecallId: '', eigeneFeuerwehr: 'Neusiedl am See' });

    fireEvent.change(screen.getByLabelText(/Feuerwehr/), {
      target: { value: 'FF Weiden' },
    });

    expect(screen.getByLabelText(/verrechnen/i)).toBeChecked();
  });

  it('lässt verrechnen im Einsatz aus', () => {
    render({ firecallId: 'abc', eigeneFeuerwehr: 'Neusiedl am See' });

    fireEvent.change(screen.getByLabelText(/Feuerwehr/), {
      target: { value: 'FF Weiden' },
    });

    expect(screen.getByLabelText(/verrechnen/i)).not.toBeChecked();
  });

  it('zieht nach einem Klick des Benutzers nicht mehr nach', () => {
    render({ firecallId: '', eigeneFeuerwehr: 'Neusiedl am See' });

    // An und gleich wieder aus: Der Schalter gilt danach als angefasst.
    fireEvent.click(screen.getByLabelText(/verrechnen/i));
    fireEvent.click(screen.getByLabelText(/verrechnen/i));
    fireEvent.change(screen.getByLabelText(/Feuerwehr/), {
      target: { value: 'FF Weiden' },
    });

    expect(screen.getByLabelText(/verrechnen/i)).not.toBeChecked();
  });

  it('zieht beim Bearbeiten einer bestehenden Füllung nie nach', () => {
    render({
      firecallId: '',
      eigeneFeuerwehr: 'Neusiedl am See',
      fuellung: {
        id: 'f1',
        anzahl: 1,
        enddruck: 300,
        gefuelltVon: 'Paul',
        zeitpunkt: 'T',
        firecallId: '',
        verrechnen: false,
        feuerwehr: 'FF Weiden',
        createdAt: '',
        createdBy: '',
        updatedAt: '',
        updatedBy: '',
      },
    });

    fireEvent.change(screen.getByLabelText(/Feuerwehr/), {
      target: { value: 'FF Gols' },
    });

    expect(screen.getByLabelText(/verrechnen/i)).not.toBeChecked();
  });
});

describe('FuellungDialog — Einsatz, Zweck und Zeitpunkt', () => {
  beforeEach(() => {
    createAtemschutzMangelMock.mockReset();
    uploadMangelImageMock.mockReset();
  });

  const bestehend = {
    id: 'f1',
    anzahl: 1,
    enddruck: 300,
    gefuelltVon: 'Paul',
    feuerwehr: 'Neusiedl am See',
    zeitpunkt: new Date(2026, 7, 29, 12, 0).toISOString(),
    firecallId: 'e1',
    firecallName: 'Brand K1',
    verrechnen: false,
    createdAt: '',
    createdBy: 'u1',
    updatedAt: '',
    updatedBy: 'u1',
  };

  it('zeigt ohne Einsatzliste kein Auswahlfeld — so am Sammelplatz', () => {
    render({ firecallId: 'e1' });
    expect(screen.queryByLabelText('Einsatz')).not.toBeInTheDocument();
  });

  it('belegt den Zweck aus dem Einsatzbezug vor', () => {
    render({ firecallId: 'e1' });
    expect(screen.getByLabelText('Zweck')).toHaveTextContent('Einsatz');

    cleanup();
    render({ firecallId: '' });
    expect(screen.getByLabelText('Zweck')).toHaveTextContent('Sonstiges');
  });

  it('zieht Zweck und verrechnen nach, wenn der Einsatz gewechselt wird', () => {
    render({
      firecallId: '',
      eigeneFeuerwehr: 'Neusiedl am See',
      firecalls: [{ id: 'e1', name: 'Brand K1' }],
    });

    fireEvent.change(screen.getByLabelText(/Feuerwehr/), {
      target: { value: 'FF Jois' },
    });
    // Fremde Wehr an der Station: zu verrechnen.
    expect(screen.getByLabelText(/verrechnen/i)).toBeChecked();

    fireEvent.mouseDown(screen.getByLabelText('Einsatz'));
    fireEvent.click(screen.getByRole('option', { name: 'Brand K1' }));

    // Im Einsatz ist es Nachbarschaftshilfe, keine Dienstleistung.
    expect(screen.getByLabelText(/verrechnen/i)).not.toBeChecked();
    expect(screen.getByLabelText('Zweck')).toHaveTextContent('Einsatz');
  });

  it('lässt einen selbst gesetzten Zweck vom Einsatzwechsel unberührt', () => {
    render({ firecallId: '', firecalls: [{ id: 'e1', name: 'Brand K1' }] });

    fireEvent.mouseDown(screen.getByLabelText('Zweck'));
    fireEvent.click(screen.getByRole('option', { name: 'Übung' }));

    fireEvent.mouseDown(screen.getByLabelText('Einsatz'));
    fireEvent.click(screen.getByRole('option', { name: 'Brand K1' }));

    // getAll: Nach dem Öffnen des zweiten Auswahlfelds trägt neben dem
    // sichtbaren Feld auch MUIs verstecktes Eingabefeld die Beschriftung.
    expect(screen.getAllByLabelText('Zweck')[0]).toHaveTextContent('Übung');
  });

  it('behält beim Bearbeiten Einsatz und Zeitpunkt der Zeile', async () => {
    // Der Kern des Fehlers aus #761: Der Dialog schickte weder Einsatz noch
    // Zeitpunkt mit — eine unter Filter „Alle" korrigierte Einsatzfüllung
    // verlor ihren Einsatz und bekam die aktuelle Uhrzeit.
    const { onSave } = render({
      firecallId: '',
      firecalls: [{ id: 'e1', name: 'Brand K1' }],
      fuellung: bestehend,
    });

    expect(screen.getByLabelText('Einsatz')).toHaveTextContent('Brand K1');
    expect(screen.getByLabelText(/Zeitpunkt/)).toHaveValue('2026-08-29T12:00');

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      firecallId: 'e1',
      firecallName: 'Brand K1',
      zeitpunkt: bestehend.zeitpunkt,
    });
  });

  it('hält einen Einsatz, der nicht mehr in der Liste steht', async () => {
    // Ein abgeschlossener Einsatz fällt aus der Auswahl. Ohne eigenen Eintrag
    // stünde das Feld leer und ein Speichern nähme der Zeile den Einsatz.
    const { onSave } = render({
      firecallId: '',
      firecalls: [{ id: 'e2', name: 'Anderer Einsatz' }],
      fuellung: bestehend,
    });

    expect(screen.getByLabelText('Einsatz')).toHaveTextContent('Brand K1');

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      firecallId: 'e1',
      firecallName: 'Brand K1',
    });
  });

  it('nimmt der Zeile den Einsatz, wenn „Ohne Einsatz" gewählt wird', async () => {
    const { onSave } = render({
      firecallId: '',
      firecalls: [{ id: 'e1', name: 'Brand K1' }],
      fuellung: bestehend,
    });

    fireEvent.mouseDown(screen.getByLabelText('Einsatz'));
    fireEvent.click(screen.getByRole('option', { name: 'Ohne Einsatz' }));

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      firecallId: '',
      firecallName: undefined,
    });
  });

  it('schickt beim Anlegen ohne Einsatzliste keinen Einsatz mit', async () => {
    // Am Sammelplatz bestimmt der Kontext den Einsatz — der Dialog darf ihn
    // nicht überstimmen.
    const { onSave } = render({ firecallId: 'e1' });

    fireEvent.change(screen.getByLabelText(/Feuerwehr/), {
      target: { value: 'FF Jois' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect('firecallId' in onSave.mock.calls[0][0]).toBe(false);
  });

  it('zeigt beim Anlegen kein Zeitpunkt-Feld', () => {
    render({ firecallId: '' });
    expect(screen.queryByLabelText(/Zeitpunkt/)).not.toBeInTheDocument();
  });
});
