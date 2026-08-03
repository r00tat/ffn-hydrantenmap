import { describe, expect, it, vi } from 'vitest';

// `fetchRecipients.ts` starts with `import 'server-only'` and imports
// `loadCredentials` from `./fetchAlarms`, which in turn imports the Firebase
// Admin SDK. None of that is exercised by these tests (they only cover the
// pure `mapRecipients` mapper), but the module-level imports still run when
// the test file imports `mapRecipients`. Mock them the same way
// `fetchAlarms.test.ts` does, so importing the module doesn't try to load the
// `server-only` client-component guard or initialize Firebase Admin for real.
vi.mock('server-only', () => ({}));
vi.mock('../firebase/admin', () => ({
  firestore: {
    collection: () => ({ doc: () => ({ get: vi.fn() }) }),
  },
}));
vi.mock('./encryption', () => ({
  decryptPassword: vi.fn(async () => 'secret'),
}));

import { mapRecipients } from './fetchRecipients';

describe('mapRecipients', () => {
  it('liest id und name direkt', () => {
    expect(mapRecipients([{ id: '42', name: 'Max Mustermann' }])).toEqual([
      { id: '42', name: 'Max Mustermann' },
    ]);
  });

  it('setzt den Namen aus firstName und lastName zusammen', () => {
    expect(mapRecipients([{ id: '42', firstName: 'Max', lastName: 'Mustermann' }])).toEqual([
      { id: '42', name: 'Max Mustermann' },
    ]);
  });

  it('akzeptiert recipientId und participantId als ID', () => {
    expect(mapRecipients([{ recipientId: 'r1', name: 'A' }, { participantId: 7, name: 'B' }])).toEqual([
      { id: 'r1', name: 'A' },
      { id: '7', name: 'B' },
    ]);
  });

  it('ignoriert Sätze ohne brauchbare ID', () => {
    expect(mapRecipients([{ name: 'Ohne ID' }, { id: '', name: 'Leer' }])).toEqual([]);
  });

  it('ignoriert Sätze ohne Namen', () => {
    expect(mapRecipients([{ id: '1' }, { id: '2', firstName: '  ' }])).toEqual([]);
  });

  it('akzeptiert eine umhüllte Liste', () => {
    expect(mapRecipients({ recipients: [{ id: '1', name: 'A' }] })).toEqual([{ id: '1', name: 'A' }]);
    expect(mapRecipients({ data: [{ id: '2', name: 'B' }] })).toEqual([{ id: '2', name: 'B' }]);
  });

  it('liefert eine leere Liste für unbrauchbare Antworten', () => {
    expect(mapRecipients(null)).toEqual([]);
    expect(mapRecipients('nope')).toEqual([]);
    expect(mapRecipients({ irgendwas: true })).toEqual([]);
  });

  it('entfernt doppelte IDs und behält den ersten Satz', () => {
    expect(mapRecipients([{ id: '1', name: 'Erst' }, { id: '1', name: 'Zweit' }])).toEqual([
      { id: '1', name: 'Erst' },
    ]);
  });
});
