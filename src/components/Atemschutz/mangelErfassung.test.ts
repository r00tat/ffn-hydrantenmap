import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMangelMock } = vi.hoisted(() => ({
  createMangelMock: vi.fn(),
}));

vi.mock('./atemschutzActions', () => ({
  createAtemschutzMangel: createMangelMock,
}));
vi.mock('../Fahrtenbuch/uploadMangelImage', () => ({
  uploadMangelImage: vi.fn(),
}));
vi.mock('../Fahrtenbuch/compressImage', () => ({
  MangelImageError: class extends Error {},
  prepareMangelImage: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => () => '' }));

const { saveAtemschutzMangel } = await import('./mangelErfassung');

const EINGABE = { description: 'Ventil undicht', images: [] };

beforeEach(() => {
  createMangelMock.mockReset();
  createMangelMock.mockResolvedValue({ success: true, id: 'm1' });
});

describe('saveAtemschutzMangel', () => {
  it('meldet den Mangel in der Gruppe der Flasche, nicht in der des Einsatzes', async () => {
    await saveAtemschutzMangel(
      'bezirk',
      { id: 'flasche-1', groupId: 'ffnd' },
      EINGABE,
    );
    expect(createMangelMock).toHaveBeenCalledWith('ffnd', {
      geraetId: 'flasche-1',
      description: 'Ventil undicht',
      images: [],
    });
  });

  it('fällt ohne Herkunft auf die Arbeitsgruppe zurück', async () => {
    await saveAtemschutzMangel('bezirk', { id: 'flasche-1' }, EINGABE);
    expect(createMangelMock.mock.calls[0][0]).toBe('bezirk');
  });
});
