// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import { IntlWrapper } from '../../test-utils/intlRender';

const addItem = vi.fn().mockResolvedValue({ id: 'diary-1' });
const vermerkeTagebuch = vi.fn().mockResolvedValue(undefined);

vi.mock('../../hooks/useFirecallItemAdd', () => ({
  default: () => addItem,
}));
vi.mock('../../hooks/useFirecall', () => ({
  useFirecallId: () => 'call-1',
}));
vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => ({ uid: 'uid-1' }),
}));
vi.mock('./atemschutzStore', () => ({
  vermerkeTagebuch: (...args: unknown[]) => vermerkeTagebuch(...args),
}));

const { default: useTruppTagebuch } = await import('./useTruppTagebuch');

const trupp: AtemschutzTrupp = {
  id: 't1',
  truppKey: 'k1',
  laufendeNummer: 1,
  truppName: '1',
  feuerwehr: 'AS-Trupp Neusiedl',
  mitglieder: ['Huber'],
  status: 'imEinsatz',
  bereitSeit: '2026-09-03T08:00:00.000Z',
  entsendetAn: 'LFA',
  abmarschZeit: '2026-09-03T08:00:00.000Z',
  druckAbmarsch: 300,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

const hook = () =>
  renderHook(() => useTruppTagebuch(), { wrapper: IntlWrapper }).result.current;

describe('useTruppTagebuch', () => {
  beforeEach(() => {
    addItem.mockClear();
    vermerkeTagebuch.mockClear();
  });

  it('schreibt den Eintrag und vermerkt ihn am Trupp', async () => {
    await hook()(trupp, 'auftrag');
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem.mock.calls[0][0]).toMatchObject({
      type: 'diary',
      art: 'M',
      von: 'AS-Trupp Neusiedl 1',
      an: 'LFA',
    });
    expect(vermerkeTagebuch).toHaveBeenCalledWith(
      'call-1',
      't1',
      'auftrag',
      expect.objectContaining({ userId: 'uid-1' }),
    );
  });

  it('schreibt nicht ein zweites Mal, wenn der Merker steht', async () => {
    // Zwei Geräte sehen denselben Trupp.
    await hook()(
      { ...trupp, tagebuch: { auftrag: '2026-09-03T08:00:00.000Z' } },
      'auftrag',
    );
    expect(addItem).not.toHaveBeenCalled();
    expect(vermerkeTagebuch).not.toHaveBeenCalled();
  });

  it('vermerkt die freie Meldung nicht — ein zweiter Haken ist eine zweite Meldung', async () => {
    await hook()(trupp, 'meldung', {
      zeitpunkt: '2026-09-03T08:12:00.000Z',
      bemerkung: 'starke Verrauchung',
    });
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(vermerkeTagebuch).not.toHaveBeenCalled();
  });

  it('wirft nicht, wenn das Schreiben scheitert', async () => {
    // Der Zustandswechsel ist schon geschrieben — ein fehlender
    // Tagebucheintrag darf ihn nicht mitreißen.
    addItem.mockRejectedValueOnce(new Error('offline'));
    await expect(hook()(trupp, 'rueckkehr')).resolves.toBeUndefined();
  });
});
