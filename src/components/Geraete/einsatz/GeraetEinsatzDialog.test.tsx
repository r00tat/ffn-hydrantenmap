// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand, GeraetEinsatz, GeraetSet } from '../../../common/geraet';
import { renderWithIntl as render } from '../../../test-utils/intlRender';

const mocks = vi.hoisted(() => ({
  add: vi.fn((..._args: unknown[]) => 'new-id'),
  update: vi.fn((..._args: unknown[]) => undefined),
  scanCode: 'ABC123',
}));

vi.mock('./geraetEinsatzWrites', () => ({
  addGeraetEinsatz: mocks.add,
  updateGeraetEinsatz: mocks.update,
}));
vi.mock('firebase/firestore', () => ({ deleteField: () => 'DELETE' }));
// Die Kamera gibt es im Test nicht: Der Scan liefert einen festen Code. Der
// Ersatz rendert ohne eigenes Portal neben dem modalen Dialog, der seine
// Geschwister `aria-hidden` setzt — daher `hidden: true` beim Suchen.
vi.mock('./GeraetScanDialog', () => ({
  default: ({ open, onCode }: { open: boolean; onCode: (code: string) => void }) =>
    open ? <button onClick={() => onCode(mocks.scanCode)}>Scan liefern</button> : null,
}));

import GeraetEinsatzDialog from './GeraetEinsatzDialog';

function geraet(overrides: Partial<Geraet>): Geraet {
  return {
    id: 'g',
    bezeichnung: 'Artikel',
    verbrauchsmaterial: false,
    bestandGesamt: 0,
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

const vlies = geraet({
  id: 'vlies',
  bezeichnung: 'Bindevlies Economy',
  verbrauchsmaterial: true,
  einheit: 'Stk',
  bestandGesamt: 53,
});
const pumpe = geraet({
  id: 'pumpe',
  bezeichnung: 'Tauchpumpe',
  inventarNr: '4711',
  barcodes: ['ABC123'],
});
const aggregat = geraet({
  id: 'aggregat',
  bezeichnung: 'Stromaggregat',
  einheitVerwendungsnachweis: 'h',
});

const bestaende = new Map<string, GeraetBestand[]>([
  [
    'vlies',
    [
      {
        id: 'lager',
        geraetId: 'vlies',
        lagerortKey: 'raum|feuerwehrhaus|lager',
        lagerort: { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
        anzahl: 50,
      },
      {
        id: 'srf',
        geraetId: 'vlies',
        lagerortKey: 'fahrzeug|srf|gr 2',
        lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
        anzahl: 3,
      },
    ],
  ],
]);

function renderDialog(props: Partial<Parameters<typeof GeraetEinsatzDialog>[0]> = {}) {
  const onClose = vi.fn();
  render(
    <GeraetEinsatzDialog
      onClose={onClose}
      firecallId="fc1"
      groupId="ffnd"
      geraete={[vlies, pumpe, aggregat]}
      bestaendeByGeraet={bestaende}
      vehicleNames={['SRF Neusiedl']}
      createdBy="erika.musterfrau@example.com"
      {...props}
    />,
  );
  return { onClose };
}

async function pickArticle(text: string, option: RegExp) {
  const user = userEvent.setup();
  await user.type(screen.getByRole('combobox', { name: /Artikel/ }), text);
  await user.click(await screen.findByRole('option', { name: option }));
  return user;
}

describe('GeraetEinsatzDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scanCode = 'ABC123';
  });

  it('unterscheidet gleichnamige Geräte an Typ und Seriennummer und zeigt den Steckbrief', async () => {
    const m1 = geraet({
      id: 'm1',
      bezeichnung: 'Mehrgasmessgerät 1',
      klasse1: 'Messgeräte und Nachweismittel',
      vorlage: 'Gasmessgerät',
      hersteller: 'Dräger',
      herstellerTyp: 'X-am 5000',
      seriennummer: 'SN-1',
    });
    const m2 = geraet({
      ...m1,
      id: 'm2',
      bezeichnung: 'Mehrgasmessgerät 2',
      herstellerTyp: 'X-am 2800',
      seriennummer: 'SN-2',
      zubehoer: 'Prüfschale',
    });
    const pruefgas = geraet({
      ...m1,
      id: 'pg',
      bezeichnung: 'Prüfgas X-am',
      seriennummer: undefined,
    });
    renderDialog({ geraete: [m1, m2, pruefgas] });
    const user = userEvent.setup();
    await user.type(screen.getByRole('combobox', { name: /Artikel/ }), 'messgerät');

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[1]).toHaveTextContent('Gerät · Gasmessgerät · Dräger X-am 2800 · SN SN-2');

    await user.click(options[1]);
    expect(screen.getByText('Prüfschale')).toBeInTheDocument();
  });

  it('belegt beim Verbrauch den Lagerort in einem zugeordneten Container vor', async () => {
    const imContainer = new Map(bestaende);
    imContainer.set('vlies', [
      ...(bestaende.get('vlies') ?? []),
      {
        id: 'container',
        geraetId: 'vlies',
        lagerortKey: 'container|c1',
        lagerort: { art: 'container', container: 'Ölsperren 1', containerId: 'c1' },
        anzahl: 1,
      },
    ]);
    renderDialog({ bestaendeByGeraet: imContainer, vehicleNames: [], assignedIds: ['c1'] });
    await pickArticle('binde', /Bindevlies/);
    expect(screen.getByRole('combobox', { name: 'Lagerort' })).toHaveTextContent(
      'Ölsperren 1 – Bestand 1 · im Einsatz',
    );
  });

  it('ordnet ein Gerät zu, ohne Lagerort und ohne auf den Server zu warten', async () => {
    const { onClose } = renderDialog();
    const user = await pickArticle('4711', /Tauchpumpe/);

    expect(screen.getByText(/wird dem Einsatz zugeordnet/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Lagerort')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(mocks.add).toHaveBeenCalledTimes(1);
    const [firecallId, data] = mocks.add.mock.calls[0] as [string, Omit<GeraetEinsatz, 'id'>];
    expect(firecallId).toBe('fc1');
    expect(data).toMatchObject({
      groupId: 'ffnd',
      geraetId: 'pumpe',
      geraetName: 'Tauchpumpe',
      art: 'zugeordnet',
      menge: 1,
      createdBy: 'erika.musterfrau@example.com',
    });
    expect('bestandId' in data).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('Verbrauch: Lagerort auf dem Fahrzeug des Einsatzes vorbelegt, Menge wird übernommen', async () => {
    renderDialog();
    const user = await pickArticle('binde', /Bindevlies/);

    expect(screen.getByText(/wird vom gewählten Lagerort abgebucht/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Lagerort' })).toHaveTextContent('SRF · GR 2');

    const menge = screen.getByRole('textbox', { name: /Menge/ });
    await user.clear(menge);
    await user.type(menge, '3');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    const [, data] = mocks.add.mock.calls[0] as [string, Omit<GeraetEinsatz, 'id'>];
    expect(data).toMatchObject({ art: 'verbraucht', bestandId: 'srf', menge: 3 });
  });

  it('Lagerort lässt sich ändern', async () => {
    renderDialog();
    const user = await pickArticle('binde', /Bindevlies/);
    await user.click(screen.getByRole('combobox', { name: 'Lagerort' }));
    await user.click(
      within(screen.getByRole('listbox')).getByRole('option', { name: /Feuerwehrhaus · Lager/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    const [, data] = mocks.add.mock.calls[0] as [string, Omit<GeraetEinsatz, 'id'>];
    expect(data.bestandId).toBe('lager');
  });

  it('erfasst bei Einheit h die Stunden', async () => {
    renderDialog();
    const user = await pickArticle('strom', /Stromaggregat/);
    await user.type(screen.getByRole('textbox', { name: /Stunden/ }), '2,5');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    const [, data] = mocks.add.mock.calls[0] as [string, Omit<GeraetEinsatz, 'id'>];
    expect(data).toMatchObject({ art: 'zugeordnet', stunden: 2.5 });
    expect('menge' in data).toBe(false);
  });

  it('erfasst mehrere Artikel in einem Zug mit Standardwerten', async () => {
    const { onClose } = renderDialog();
    const user = await pickArticle('binde', /Bindevlies/);
    const input = screen.getByRole('combobox', { name: /Artikel/ });
    await user.clear(input);
    await user.type(input, 'tauch');
    await user.click(await screen.findByRole('option', { name: /Tauchpumpe/ }));
    await user.clear(input);
    await user.type(input, 'strom');
    await user.click(await screen.findByRole('option', { name: /Stromaggregat/ }));

    expect(screen.getByText(/3 Artikel werden erfasst/)).toBeInTheDocument();
    expect(screen.getByText('1 Stk von SRF · GR 2')).toBeInTheDocument();
    // Einzelfelder gibt es erst wieder beim Bearbeiten je Eintrag.
    expect(screen.queryByRole('combobox', { name: 'Lagerort' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Menge/ })).toBeNull();

    await user.type(screen.getByRole('textbox', { name: 'Bemerkung' }), 'Ölspur');
    await user.click(screen.getByRole('button', { name: '3 erfassen' }));

    expect(mocks.add).toHaveBeenCalledTimes(3);
    const data = mocks.add.mock.calls.map((c) => c[1] as Omit<GeraetEinsatz, 'id'>);
    expect(data[0]).toMatchObject({
      geraetId: 'vlies',
      art: 'verbraucht',
      bestandId: 'srf',
      menge: 1,
      bemerkung: 'Ölspur',
    });
    expect(data[1]).toMatchObject({ geraetId: 'pumpe', art: 'zugeordnet', menge: 1 });
    expect(data[2]).toMatchObject({ geraetId: 'aggregat', art: 'zugeordnet' });
    expect('stunden' in data[2]).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('behält den Suchbegriff nach der Auswahl — gleichnamige Artikel lassen sich nacheinander anklicken', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const plane1 = geraet({ id: 'p1', bezeichnung: 'Abdeckplane', seriennummer: 'A' });
    const plane2 = geraet({ id: 'p2', bezeichnung: 'Abdeckplane', seriennummer: 'B' });
    renderDialog({ geraete: [plane1, plane2, pumpe] });
    const user = userEvent.setup();
    const input = screen.getByRole('combobox', { name: /Artikel/ });
    await user.type(input, 'abdeck');
    const [first] = await screen.findAllByRole('option');
    await user.click(first);
    expect(input).toHaveValue('abdeck');
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    await user.click(options[1]);
    await user.click(screen.getByRole('button', { name: '2 erfassen' }));
    expect(mocks.add.mock.calls.map((c) => (c[1] as GeraetEinsatz).geraetId)).toEqual(['p1', 'p2']);
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key/);
    errors.mockRestore();
  });

  it('nimmt einen abgewählten Artikel wieder heraus und zeigt dann die Einzelfelder', async () => {
    renderDialog();
    const user = await pickArticle('binde', /Bindevlies/);
    const input = screen.getByRole('combobox', { name: /Artikel/ });
    await user.clear(input);
    await user.type(input, 'tauch');
    await user.click(await screen.findByRole('option', { name: /Tauchpumpe/ }));
    // Ein zweiter Klick auf die Option wählt sie wieder ab.
    await user.click(await screen.findByRole('option', { name: /Tauchpumpe/ }));
    expect(screen.getByRole('textbox', { name: /Menge/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(mocks.add).toHaveBeenCalledTimes(1);
  });

  it('kennzeichnet Artikel, die schon im Einsatz erfasst sind', async () => {
    renderDialog({ assignedIds: ['pumpe'] });
    const user = userEvent.setup();
    await user.type(screen.getByRole('combobox', { name: /Artikel/ }), 'tauch');
    expect(await screen.findByRole('option', { name: /Tauchpumpe/ })).toHaveTextContent(
      'bereits im Einsatz',
    );
  });

  it('ohne Artikel wird nicht gespeichert', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(mocks.add).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Bitte einen Artikel wählen.')).toBeInTheDocument();
  });

  it('übernimmt einen eindeutigen Scan', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Barcode scannen' }));
    await user.click(screen.getByRole('button', { name: 'Scan liefern', hidden: true }));
    expect(screen.getByRole('button', { name: 'Tauchpumpe (4711)' })).toBeInTheDocument();
    expect(screen.getByText(/wird dem Einsatz zugeordnet/)).toBeInTheDocument();
  });

  it('meldet einen Scan ohne Treffer', async () => {
    const user = userEvent.setup();
    renderDialog({ geraete: [vlies] });
    await user.click(screen.getByRole('button', { name: 'Barcode scannen' }));
    await user.click(screen.getByRole('button', { name: 'Scan liefern', hidden: true }));
    expect(screen.getByText(/Kein Artikel mit dem Code „ABC123“/)).toBeInTheDocument();
  });

  it('ändert einen Verbrauch und markiert ihn als nicht gebucht', async () => {
    const user = userEvent.setup();
    const entry: GeraetEinsatz = {
      id: 'e1',
      groupId: 'ffnd',
      geraetId: 'vlies',
      geraetName: 'Bindevlies Economy',
      art: 'verbraucht',
      bestandId: 'lager',
      menge: 2,
      zeitpunkt: '2026-10-04T10:00:00.000Z',
      gebucht: true,
      createdAt: '2026-10-04T10:00:00.000Z',
      createdBy: 'erika.musterfrau@example.com',
    };
    renderDialog({ entry });

    expect(screen.getByRole('textbox', { name: 'Artikel' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Lagerort' })).toHaveTextContent(
      'Feuerwehrhaus · Lager',
    );
    const menge = screen.getByRole('textbox', { name: /Menge/ });
    await user.clear(menge);
    await user.type(menge, '4');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith('fc1', entry, {
      bestandId: 'lager',
      menge: 4,
      stunden: 'DELETE',
      bemerkung: 'DELETE',
      gebucht: false,
    });
  });

  it('behält beim Ändern die Art des Eintrags, auch wenn der Artikel kein Verbrauchsmaterial mehr ist', async () => {
    const user = userEvent.setup();
    const entry: GeraetEinsatz = {
      id: 'e2',
      groupId: 'ffnd',
      geraetId: 'vlies',
      geraetName: 'Bindevlies Economy',
      art: 'verbraucht',
      bestandId: 'lager',
      menge: 5,
      zeitpunkt: '2026-10-04T10:00:00.000Z',
      gebucht: true,
      createdAt: '2026-10-04T10:00:00.000Z',
      createdBy: 'erika.musterfrau@example.com',
    };
    renderDialog({ entry, geraete: [{ ...vlies, verbrauchsmaterial: false }, pumpe] });

    expect(screen.getByRole('combobox', { name: 'Lagerort' })).toHaveTextContent(
      'Feuerwehrhaus · Lager',
    );
    await user.type(screen.getByRole('textbox', { name: 'Bemerkung' }), 'nachgetragen');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(mocks.update).toHaveBeenCalledWith('fc1', entry, {
      bestandId: 'lager',
      menge: 5,
      stunden: 'DELETE',
      bemerkung: 'nachgetragen',
      gebucht: false,
    });
  });
});

describe('GeraetEinsatzDialog mit Sets', () => {
  const kiste = geraet({
    id: 'kiste',
    bezeichnung: 'Ölspur-Kiste',
    materialTyp: 'Set-Artikel',
    barcodes: ['KISTE-1'],
  });
  const alt = geraet({ id: 'alt', bezeichnung: 'Altgerät', active: false });
  const oelspur: GeraetSet = {
    id: 'oelspur',
    name: 'Ölspur',
    sybosSetArtikelId: 'kiste',
    codes: ['OEL'],
    inhalt: [
      { geraetId: 'vlies', menge: 4, bestandId: 'lager' },
      { geraetId: 'pumpe' },
      { geraetId: 'alt' },
    ],
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
  };

  function renderWithSets() {
    return renderDialog({ geraete: [vlies, pumpe, aggregat, kiste, alt], sets: [oelspur] });
  }

  function row(name: RegExp) {
    return screen.getByRole('listitem', { name });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scanCode = 'ABC123';
  });

  it('bietet ein Set unter den Artikeln an, mit Kennzeichen und Inhaltszahl', async () => {
    renderWithSets();
    const user = userEvent.setup();
    await user.type(screen.getByRole('combobox', { name: /Artikel/ }), 'ölspur');
    const options = await screen.findAllByRole('option');
    const set = options[options.length - 1];
    expect(set).toHaveTextContent('Ölspur');
    expect(set).toHaveTextContent('Set');
    expect(set).toHaveTextContent('3 Inhalte');
  });

  it('zeigt die Vorschau eines Sets und legt alle Einträge mit Set-Bezug an', async () => {
    const { onClose } = renderWithSets();
    const user = await pickArticle('ölspur', /^Ölspur Set/);

    expect(screen.getByText('Set Ölspur')).toBeInTheDocument();
    expect(within(row(/Ölspur-Kiste/)).getByText(/Set-Artikel/)).toBeInTheDocument();
    expect(row(/Bindevlies/)).toBeInTheDocument();
    expect(row(/Tauchpumpe/)).toBeInTheDocument();
    expect(within(row(/Altgerät/)).getByText('inaktiv – wird nicht angelegt')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '3 erfassen' }));

    expect(mocks.add).toHaveBeenCalledTimes(3);
    const data = mocks.add.mock.calls.map((c) => c[1] as Omit<GeraetEinsatz, 'id'>);
    expect(data[0]).toMatchObject({
      geraetId: 'kiste',
      art: 'zugeordnet',
      menge: 1,
      setId: 'oelspur',
      setName: 'Ölspur',
    });
    expect(data[1]).toMatchObject({
      geraetId: 'vlies',
      art: 'verbraucht',
      bestandId: 'lager',
      menge: 4,
      setId: 'oelspur',
    });
    expect(data[2]).toMatchObject({ geraetId: 'pumpe', art: 'zugeordnet', menge: 1 });
    expect(data[0].setZuordnungId).toBeTruthy();
    expect(new Set(data.map((d) => d.setZuordnungId)).size).toBe(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('Menge und Lagerort lassen sich je Zeile ändern', async () => {
    renderWithSets();
    const user = await pickArticle('ölspur', /^Ölspur Set/);
    const vliesRow = row(/Bindevlies/);
    const menge = within(vliesRow).getByRole('textbox', { name: 'Menge (Stk)' });
    await user.clear(menge);
    await user.type(menge, '2');
    await user.click(within(vliesRow).getByRole('combobox', { name: 'Lagerort' }));
    await user.click(
      within(screen.getByRole('listbox')).getByRole('option', { name: /SRF · GR 2/ }),
    );
    await user.click(screen.getByRole('button', { name: '3 erfassen' }));
    const [, data] = mocks.add.mock.calls[1] as [string, Omit<GeraetEinsatz, 'id'>];
    expect(data).toMatchObject({ geraetId: 'vlies', bestandId: 'srf', menge: 2 });
  });

  it('erfasst ein Set zusammen mit einzelnen Artikeln', async () => {
    renderWithSets();
    const user = await pickArticle('ölspur', /^Ölspur Set/);
    const input = screen.getByRole('combobox', { name: /Artikel/ });
    await user.clear(input);
    await user.type(input, 'strom');
    await user.click(await screen.findByRole('option', { name: /Stromaggregat/ }));

    expect(screen.getByText('Einzelne Artikel')).toBeInTheDocument();
    await user.type(within(row(/Stromaggregat/)).getByRole('textbox', { name: 'Stunden' }), '1,5');
    await user.click(screen.getByRole('button', { name: '4 erfassen' }));

    expect(mocks.add).toHaveBeenCalledTimes(4);
    const last = mocks.add.mock.calls[3][1] as Omit<GeraetEinsatz, 'id'>;
    expect(last).toMatchObject({ geraetId: 'aggregat', stunden: 1.5 });
    expect('setId' in last).toBe(false);
    expect('setZuordnungId' in last).toBe(false);
  });

  it('meldet eine ungültige Menge an der Zeile und speichert nichts', async () => {
    const { onClose } = renderWithSets();
    const user = await pickArticle('ölspur', /^Ölspur Set/);
    const vliesRow = row(/Bindevlies/);
    const menge = within(vliesRow).getByRole('textbox', { name: 'Menge (Stk)' });
    await user.clear(menge);
    await user.type(menge, 'abc');
    await user.click(screen.getByRole('button', { name: '3 erfassen' }));
    expect(within(vliesRow).getByText('Bitte eine gültige Menge angeben.')).toBeInTheDocument();
    expect(mocks.add).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('übernimmt ein Set per Scan seines Codes', async () => {
    mocks.scanCode = 'OEL';
    renderWithSets();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Barcode scannen' }));
    await user.click(screen.getByRole('button', { name: 'Scan liefern', hidden: true }));
    expect(screen.getByText('Set „Ölspur“ übernommen.')).toBeInTheDocument();
    expect(screen.getByText('Set Ölspur')).toBeInTheDocument();
  });

  it('der Scan des Set-Artikels übernimmt das Set, nicht nur die Kiste', async () => {
    mocks.scanCode = 'KISTE-1';
    renderWithSets();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Barcode scannen' }));
    await user.click(screen.getByRole('button', { name: 'Scan liefern', hidden: true }));
    expect(screen.getByText('Set Ölspur')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3 erfassen' })).toBeInTheDocument();
  });

  it('ohne Sets (Einsatz-Gast) bietet die Suche nur Artikel an', async () => {
    renderDialog({ geraete: [vlies, pumpe, kiste] });
    const user = userEvent.setup();
    await user.type(screen.getByRole('combobox', { name: /Artikel/ }), 'ölspur');
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Ölspur-Kiste');
  });
});
