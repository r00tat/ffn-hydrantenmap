// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand, GeraetEinsatz } from '../../../common/geraet';
import { renderWithIntl as render } from '../../../test-utils/intlRender';

const mocks = vi.hoisted(() => ({
  add: vi.fn((..._args: unknown[]) => 'new-id'),
  update: vi.fn((..._args: unknown[]) => undefined),
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
    open ? <button onClick={() => onCode('ABC123')}>Scan liefern</button> : null,
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
    const pruefgas = geraet({ ...m1, id: 'pg', bezeichnung: 'Prüfgas X-am', seriennummer: undefined });
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
