// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PA_SAETZE, type AtemschutzTrupp } from '../../common/atemschutz';
import { renderWithIntl } from '../../test-utils/intlRender';
import useUeberwachungHinweise from './useUeberwachungHinweise';

const { showSnackbar } = vi.hoisted(() => ({ showSnackbar: vi.fn() }));

vi.mock('../providers/SnackbarProvider', () => ({
  useSnackbar: () => showSnackbar,
}));

const native = vi.hoisted(() => ({
  available: false,
  sync: vi.fn(async () => {}),
}));

vi.mock('../../lib/nativeLocalNotifications', () => ({
  isNativeLocalNotificationsAvailable: () => native.available,
  syncNativeNotifications: native.sync,
}));

const ABMARSCH = '2026-09-02T10:00:00.000Z';

function nachAbmarsch(minuten: number): Date {
  return new Date(new Date(ABMARSCH).getTime() + minuten * 60_000);
}

function trupp(over: Partial<AtemschutzTrupp> = {}): AtemschutzTrupp {
  return {
    id: 't1',
    truppKey: 'k1',
    laufendeNummer: 1,
    truppName: 'Trupp 1',
    feuerwehr: 'Neusiedl am See',
    mitglieder: ['Anna', 'Bernd', 'Clara'],
    status: 'imEinsatz',
    bereitSeit: ABMARSCH,
    abmarschZeit: ABMARSCH,
    druckAbmarsch: 300,
    paTyp: 'standard300',
    createdAt: ABMARSCH,
    createdBy: 'u1',
    updatedAt: ABMARSCH,
    updatedBy: 'u1',
    ...over,
  };
}

function Probe({ trupps, jetzt }: { trupps: AtemschutzTrupp[]; jetzt: Date }) {
  useUeberwachungHinweise({
    firecallId: 'f1',
    firecallName: 'Zimmerbrand Hauptstraße',
    trupps,
    jetzt,
    vorgabe: PA_SAETZE.standard300,
  });
  return null;
}

/** Der erste Aufruf, aufgeschlüsselt — die Reihenfolge von `showSnackbar`. */
function ersterAufruf() {
  const [message, severity, action, dauer] = showSnackbar.mock.calls[0];
  return { message, severity, action, dauer };
}

describe('useUeberwachungHinweise', () => {
  beforeEach(() => showSnackbar.mockClear());

  it('meldet auf der Seite, auch ohne Notification-Erlaubnis', () => {
    // In JSDOM gibt es kein `Notification` — genau der Fall „keine Erlaubnis".
    // Vorher stieg der Hook davor aus und die Seite zeigte nichts an.
    expect(typeof Notification).toBe('undefined');
    // Erwartete Dauer 25,8 min, das erste Drittel also bei 8,6 min.
    renderWithIntl(<Probe trupps={[trupp()]} jetzt={nachAbmarsch(9)} />);

    expect(showSnackbar).toHaveBeenCalledTimes(1);
    const { message, severity, action, dauer } = ersterAufruf();
    expect(message).toMatch(/keine Meldung nach einem Drittel der Einsatzzeit/);
    expect(severity).toBe('warning');
    expect(action).toBeUndefined();
    expect(dauer).toBe(6000);
  });

  it('meldet eine Vorwarnung orange und mit zehn Sekunden', () => {
    // Ohne Ankunftsmeldung gilt die Restdruckwarnung bei 26,5 min: Bei 26 min
    // ist die Warnung fällig, der Zeitpunkt aber nicht erreicht.
    renderWithIntl(<Probe trupps={[trupp()]} jetzt={nachAbmarsch(26)} />);

    const { message, severity, dauer } = ersterAufruf();
    expect(message).toMatch(/Rückzug in 1 min/);
    expect(severity).toBe('warning');
    expect(dauer).toBe(10_000);
  });

  it('meldet einen überschrittenen Rückzugszeitpunkt rot', () => {
    renderWithIntl(<Probe trupps={[trupp()]} jetzt={nachAbmarsch(30)} />);

    const { message, severity, dauer } = ersterAufruf();
    expect(message).toMatch(/Rückzugszeitpunkt erreicht/);
    expect(severity).toBe('error');
    expect(dauer).toBe(10_000);
  });

  it('meldet von mehreren Trupps nur den dringlichsten', () => {
    // Trupp 1 ist seit 9 min unterwegs (Drittelmarke), Trupp 2 seit 30 min
    // (Rückzugszeitpunkt überschritten).
    renderWithIntl(
      <Probe
        trupps={[
          trupp({ id: 't1', truppName: 'Trupp 1' }),
          trupp({
            id: 't2',
            truppName: 'Trupp 2',
            abmarschZeit: new Date(
              new Date(ABMARSCH).getTime() - 21 * 60_000,
            ).toISOString(),
          }),
        ]}
        jetzt={nachAbmarsch(9)}
      />,
    );

    expect(showSnackbar).toHaveBeenCalledTimes(1);
    const { message } = ersterAufruf();
    expect(message).toMatch(/Trupp 2/);
    expect(message).not.toMatch(/keine Meldung nach einem Drittel/);
  });

  it('meldet dieselbe Warnung nicht ein zweites Mal', () => {
    const { rerender } = renderWithIntl(
      <Probe trupps={[trupp()]} jetzt={nachAbmarsch(9)} />,
    );
    expect(showSnackbar).toHaveBeenCalledTimes(1);

    // Ein weiterer Tick derselben Lage: Der Hinweis steht in `gemeldet`, es
    // darf keine zweite Meldung entstehen. `rerender` behält den
    // Intl-Wrapper und damit den Hook-Zustand.
    rerender(<Probe trupps={[trupp()]} jetzt={nachAbmarsch(9.1)} />);
    expect(showSnackbar).toHaveBeenCalledTimes(1);
  });
});

describe('useUeberwachungHinweise — lokaler Termin', () => {
  beforeEach(() => {
    showSnackbar.mockClear();
    native.sync.mockClear();
    native.available = false;
    vi.useFakeTimers();
    vi.setSystemTime(nachAbmarsch(1));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('weckt sich zum Termin selbst, auch ohne Sekundentakt', () => {
    // `jetzt` bleibt stehen — wie ein im Hintergrund gedrosselter Ticker.
    renderWithIntl(<Probe trupps={[trupp()]} jetzt={nachAbmarsch(1)} />);
    expect(showSnackbar).not.toHaveBeenCalled();

    // Das erste Drittel liegt bei 8,6 min.
    act(() => {
      vi.advanceTimersByTime(7 * 60_000);
    });
    expect(showSnackbar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(showSnackbar).toHaveBeenCalledTimes(1);
    expect(ersterAufruf().message).toMatch(
      /keine Meldung nach einem Drittel der Einsatzzeit/,
    );
  });

  it('hinterlegt in der App den nächsten Termin je Trupp beim Betriebssystem', () => {
    native.available = true;
    renderWithIntl(<Probe trupps={[trupp()]} jetzt={nachAbmarsch(1)} />);

    expect(native.sync).toHaveBeenCalled();
    const [group, items, channel] = native.sync.mock.calls.at(-1) as unknown as [
      string,
      Array<{ key: string; at: Date; title: string; url?: string }>,
      { id: string; name: string; description?: string },
    ];
    expect(group).toBe('asue-f1');
    // Ein eigener Kanal: Ton und Wichtigkeit der Warnungen lassen sich in den
    // Android-Einstellungen getrennt von anderen Meldungen der App einstellen.
    expect(channel).toEqual({
      id: 'atemschutz-warnung',
      name: 'Atemschutzwarnungen',
      description: expect.stringContaining('Atemschutzüberwachung'),
    });
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe('asue-t1');
    const minuten =
      (items[0].at.getTime() - new Date(ABMARSCH).getTime()) / 60_000;
    expect(minuten).toBeCloseTo(8.6, 0);
    expect(items[0].title).toMatch(/Trupp 1/);
    expect(items[0].url).toBe('/einsatz/f1/atemschutzueberwachung');
  });

  it('plant in der App nichts, solange das Plugin fehlt', () => {
    renderWithIntl(<Probe trupps={[trupp()]} jetzt={nachAbmarsch(1)} />);
    expect(native.sync).not.toHaveBeenCalled();
  });
});
