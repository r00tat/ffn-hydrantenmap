// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet } from '../../../common/geraet';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { saveGeraet, deleteGeraet } = vi.hoisted(() => ({
  saveGeraet: vi.fn(),
  deleteGeraet: vi.fn(),
}));

vi.mock('../geraeteActions', () => ({ saveGeraet, deleteGeraet }));

import GeraetEditDialog from './GeraetEditDialog';

function vlies(over: Partial<Geraet> = {}): Geraet {
  return {
    id: 'g1',
    externeId: 'g1',
    bezeichnung: 'Bindevlies Economy',
    verbrauchsmaterial: true,
    einheit: 'Sack',
    mindestbestand: 10,
    bestandGesamt: 4,
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

describe('GeraetEditDialog', () => {
  const onClose = vi.fn();
  const onDone = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    saveGeraet.mockResolvedValue({ id: 'g1' });
    deleteGeraet.mockResolvedValue({ id: 'g1', deleted: true });
  });

  function render(geraet?: Geraet) {
    return renderWithIntl(
      <GeraetEditDialog
        open
        groupId="ffnd"
        geraet={geraet}
        onClose={onClose}
        onDone={onDone}
      />,
    );
  }

  it('verlangt beim Anlegen eine Bezeichnung', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Bitte eine Bezeichnung angeben.')).toBeInTheDocument();
    expect(saveGeraet).not.toHaveBeenCalled();
  });

  it('legt einen Artikel ohne ID an', async () => {
    const user = userEvent.setup();
    render();
    await user.type(screen.getByLabelText(/Bezeichnung/), 'Ölbinder');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(saveGeraet).toHaveBeenCalled());
    const [groupId, input] = saveGeraet.mock.calls[0];
    expect(groupId).toBe('ffnd');
    expect(input).not.toHaveProperty('id');
    expect(input).toMatchObject({ bezeichnung: 'Ölbinder', active: true });
    expect(onDone).toHaveBeenCalledWith('saved');
    expect(onClose).toHaveBeenCalled();
  });

  it('speichert den geänderten Mindestbestand', async () => {
    const user = userEvent.setup();
    render(vlies());
    const min = screen.getByLabelText('Mindestbestand');
    await user.clear(min);
    await user.type(min, '8');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveGeraet).toHaveBeenCalledWith(
        'ffnd',
        expect.objectContaining({
          id: 'g1',
          mindestbestand: 8,
          verbrauchsmaterial: true,
          einheit: 'Sack',
        }),
      ),
    );
  });

  it('speichert den Vorlauf der Ablaufwarnung', async () => {
    const user = userEvent.setup();
    render(vlies({ ablaufVorlaufTage: 30 }));
    const vorlauf = screen.getByLabelText('Vorlauf Ablaufwarnung (Tage)');
    expect(vorlauf).toHaveValue(30);
    await user.clear(vorlauf);
    await user.type(vorlauf, '90');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveGeraet).toHaveBeenCalledWith(
        'ffnd',
        expect.objectContaining({ ablaufVorlaufTage: 90 }),
      ),
    );
  });

  it('löscht den Vorlauf, wenn das Feld leer ist', async () => {
    const user = userEvent.setup();
    render(vlies({ ablaufVorlaufTage: 30 }));
    await user.clear(screen.getByLabelText('Vorlauf Ablaufwarnung (Tage)'));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveGeraet).toHaveBeenCalledWith(
        'ffnd',
        expect.objectContaining({ ablaufVorlaufTage: null }),
      ),
    );
  });

  it('lehnt einen ungültigen Vorlauf ab', async () => {
    const user = userEvent.setup();
    render(vlies());
    await user.type(screen.getByLabelText('Vorlauf Ablaufwarnung (Tage)'), '1.5');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(
      await screen.findByText('Ungültiger Wert bei „Vorlauf Ablaufwarnung (Tage)“.'),
    ).toBeInTheDocument();
    expect(saveGeraet).not.toHaveBeenCalled();
  });

  it('löscht den Mindestbestand, wenn der Artikel kein Verbrauchsmaterial mehr ist', async () => {
    const user = userEvent.setup();
    render(vlies());
    await user.click(screen.getByRole('switch', { name: 'Verbrauchsmaterial' }));
    expect(screen.getByLabelText('Mindestbestand')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveGeraet).toHaveBeenCalledWith(
        'ffnd',
        expect.objectContaining({ verbrauchsmaterial: false, mindestbestand: null }),
      ),
    );
  });

  it('schickt geleerte Felder als leeren Text, damit sie am Artikel entfallen', async () => {
    const user = userEvent.setup();
    render(vlies());
    await user.clear(screen.getByLabelText(/^Einheit/));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveGeraet).toHaveBeenCalledWith(
        'ffnd',
        expect.objectContaining({ einheit: '' }),
      ),
    );
  });

  it('zeigt alle Stammdaten aus Sybos vorbefüllt und schickt sie mit', async () => {
    const user = userEvent.setup();
    render(
      vlies({
        zusatzInventarNr: '81762',
        barcodes: ['0315-8828', '0915-0127'],
        kategorie: 'Gerät',
        klasse1: 'Schadstoffausrüstung',
        klasse2: 'Bindemittel',
        klasse3: 'Vlies',
        vorlage: 'Bindemittel',
        materialTyp: 'Massenartikel',
        hersteller: 'Muster',
        herstellerTyp: 'Economy',
        seriennummer: 'S-1',
        baujahr: 2020,
        baumonat: 5,
        besitzer: 'Freiwillige Feuerwehr',
        anschaffungsDatum: '2020-06-01',
        verfuegbarVon: '2020-06-02',
        verfuegbarBis: '2030-06-01',
        lebensdauer: 10,
        lebensdauerEinheit: 'Jahr(e)',
        einkaufspreis: 67,
        zubehoer: 'Sack',
        versicherung: 'Muster Versicherung',
        polizzenummer: 'P-1',
        kasko: 'ja',
      }),
    );
    expect(screen.getByLabelText('Barcodes')).toHaveValue('0315-8828, 0915-0127');
    expect(screen.getByLabelText('Klasse 3')).toHaveValue('Vlies');
    expect(screen.getByLabelText('Verfügbar bis')).toHaveValue('2030-06-01');
    expect(screen.getByLabelText('Polizze')).toHaveValue('P-1');

    const preis = screen.getByLabelText('Einkaufspreis');
    await user.clear(preis);
    await user.type(preis, '70,5');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveGeraet).toHaveBeenCalledWith(
        'ffnd',
        expect.objectContaining({
          zusatzInventarNr: '81762',
          barcodes: ['0315-8828', '0915-0127'],
          kategorie: 'Gerät',
          klasse2: 'Bindemittel',
          klasse3: 'Vlies',
          vorlage: 'Bindemittel',
          materialTyp: 'Massenartikel',
          herstellerTyp: 'Economy',
          seriennummer: 'S-1',
          baujahr: 2020,
          baumonat: 5,
          besitzer: 'Freiwillige Feuerwehr',
          anschaffungsDatum: '2020-06-01',
          verfuegbarVon: '2020-06-02',
          verfuegbarBis: '2030-06-01',
          lebensdauer: 10,
          lebensdauerEinheit: 'Jahr(e)',
          einkaufspreis: 70.5,
          zubehoer: 'Sack',
          versicherung: 'Muster Versicherung',
          polizzenummer: 'P-1',
          kasko: 'ja',
        }),
      ),
    );
  });

  it('löscht geleerte Zahlen und lehnt einen unsinnigen Herstellungs-Monat ab', async () => {
    const user = userEvent.setup();
    render(vlies({ baujahr: 2020, baumonat: 5 }));
    await user.clear(screen.getByLabelText('Baujahr'));
    const monat = screen.getByLabelText('Herstellungs-Monat');
    await user.clear(monat);
    await user.type(monat, '13');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(
      await screen.findByText('Ungültiger Wert bei „Herstellungs-Monat“.'),
    ).toBeInTheDocument();
    expect(saveGeraet).not.toHaveBeenCalled();

    await user.clear(monat);
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveGeraet).toHaveBeenCalledWith(
        'ffnd',
        expect.objectContaining({ baujahr: null, baumonat: null }),
      ),
    );
  });

  it('lehnt einen negativen Mindestbestand ab', async () => {
    const user = userEvent.setup();
    render(vlies());
    const min = screen.getByLabelText('Mindestbestand');
    await user.clear(min);
    await user.type(min, '-3');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(
      await screen.findByText('Der Mindestbestand muss eine ganze Zahl ab 0 sein.'),
    ).toBeInTheDocument();
    expect(saveGeraet).not.toHaveBeenCalled();
  });

  it('zeigt einen Fehler der Action und bleibt offen', async () => {
    saveGeraet.mockRejectedValue(new Error('forbidden'));
    const user = userEvent.setup();
    render(vlies());
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(
      await screen.findByText('Speichern fehlgeschlagen: forbidden'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('löscht nach Rückfrage', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(vlies());
    await user.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(deleteGeraet).toHaveBeenCalledWith('ffnd', 'g1'));
    expect(onDone).toHaveBeenCalledWith('deleted');
  });
});
