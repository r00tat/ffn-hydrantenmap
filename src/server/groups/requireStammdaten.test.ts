import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GROUP_STAMMDATEN } from '../../common/groupStammdaten';

// Import-Stub, kein Verhaltens-Mock: `server-only` wirft beim Import
// außerhalb einer Server-Umgebung. Dasselbe Muster wie in
// `src/components/Fahrtenbuch/authGuards.test.ts`.
vi.mock('server-only', () => ({}));

const loadGroupStammdaten = vi.fn();
const loadGroupFeuerwehrName = vi.fn();

vi.mock('./stammdatenStore', () => ({
  loadGroupStammdaten: (...args: unknown[]) => loadGroupStammdaten(...args),
  loadGroupFeuerwehrName: (...args: unknown[]) => loadGroupFeuerwehrName(...args),
}));

const { requireStammdatenForFirecall, StammdatenUnvollstaendigError } = await import(
  './requireStammdaten'
);

const vollstaendig = {
  ...DEFAULT_GROUP_STAMMDATEN,
  absenderName: 'FF Musterdorf',
  absenderAdresse: 'Hauptstraße 1',
  iban: 'AT40 3300 0000 0202 0402',
};

describe('requireStammdatenForFirecall', () => {
  beforeEach(() => {
    loadGroupStammdaten.mockReset();
    loadGroupFeuerwehrName.mockReset();
    loadGroupFeuerwehrName.mockResolvedValue('Musterdorf');
  });

  it('liefert Gruppe und Stammdaten, wenn alles gepflegt ist', async () => {
    loadGroupStammdaten.mockResolvedValue(vollstaendig);
    const ergebnis = await requireStammdatenForFirecall({
      id: 'e1',
      name: 'Brand',
      group: 'ffnd',
    });
    expect(ergebnis.groupId).toBe('ffnd');
    expect(ergebnis.stammdaten.iban).toBe('AT40 3300 0000 0202 0402');
    expect(ergebnis.feuerwehrName).toBe('Musterdorf');
  });

  it('wirft, wenn der Einsatz keiner Gruppe zugeordnet ist', async () => {
    // Alteinsätze aus der Zeit vor dem Pflichtfeld. Ohne Gruppe ist nicht
    // bestimmbar, wessen Konto auf dem Beleg stünde.
    await expect(
      requireStammdatenForFirecall({ id: 'e1', name: 'Brand' }),
    ).rejects.toBeInstanceOf(StammdatenUnvollstaendigError);
    expect(loadGroupStammdaten).not.toHaveBeenCalled();
  });

  it('wirft mit den fehlenden Feldern, wenn die Stammdaten Lücken haben', async () => {
    loadGroupStammdaten.mockResolvedValue({ ...DEFAULT_GROUP_STAMMDATEN });
    loadGroupFeuerwehrName.mockResolvedValue('');
    await expect(
      requireStammdatenForFirecall({ id: 'e1', name: 'Brand', group: 'ffnd' }),
    ).rejects.toMatchObject({
      luecken: ['absenderName', 'absenderAdresse', 'iban'],
      groupId: 'ffnd',
    });
  });

  it('nimmt den Gruppennamen als Absender an', async () => {
    loadGroupStammdaten.mockResolvedValue({
      ...DEFAULT_GROUP_STAMMDATEN,
      absenderAdresse: 'Hauptstraße 1',
      iban: 'AT40',
    });
    loadGroupFeuerwehrName.mockResolvedValue('Musterdorf');
    await expect(
      requireStammdatenForFirecall({ id: 'e1', name: 'Brand', group: 'ffnd' }),
    ).resolves.toMatchObject({ groupId: 'ffnd' });
  });
});
