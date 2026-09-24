// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addNote,
  clearNotes,
  describeToolCall,
  loadMemory,
  MAX_NOTES,
  memoryKey,
  removeNote,
  runMemoryCommand,
  saveConversation,
  subscribeMemory,
} from './assistantMemory';

const NOW = new Date('2026-09-24T14:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('assistantMemory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('startet leer', () => {
    const memory = loadMemory('e1');
    expect(memory.notes).toEqual([]);
    expect(memory.lastConversation).toBeUndefined();
  });

  it('legt Notizen je Einsatz an', () => {
    const result = addNote('e1', '  Messwerte gehören zu Trupp 1, Ebene 7 ', localStorage, NOW);
    expect(result.ok).toBe(true);
    expect(loadMemory('e1').notes.map((n) => n.text)).toEqual([
      'Messwerte gehören zu Trupp 1, Ebene 7',
    ]);
    expect(loadMemory('e2').notes).toEqual([]);
  });

  it('lehnt leere Notizen ab', () => {
    expect(addNote('e1', '   ').ok).toBe(false);
  });

  it('nimmt eine gleichlautende Notiz nicht doppelt auf', () => {
    addNote('e1', 'Ebene 7');
    addNote('e1', 'ebene 7');
    expect(loadMemory('e1').notes).toHaveLength(1);
  });

  it(`lehnt die ${MAX_NOTES + 1}. Notiz ab, statt eine zu verdrängen`, () => {
    for (let i = 0; i < MAX_NOTES; i++) addNote('e1', `Notiz ${i}`);
    const result = addNote('e1', 'eine zu viel');
    expect(result).toMatchObject({ ok: false, reason: 'full' });
    expect(loadMemory('e1').notes).toHaveLength(MAX_NOTES);
    expect(loadMemory('e1').notes[0].text).toBe('Notiz 0');
  });

  it('löscht über ID oder Text', () => {
    const first = addNote('e1', 'Trupp 1 für Messwerte');
    addNote('e1', 'Ebene 7 ist aktiv');
    expect(first.ok && removeNote('e1', { noteId: first.note.id }).ok).toBe(true);
    expect(removeNote('e1', { text: 'ebene 7' }).ok).toBe(true);
    expect(loadMemory('e1').notes).toEqual([]);
  });

  it('löscht bei mehreren Treffern nichts', () => {
    addNote('e1', 'Trupp 1 misst');
    addNote('e1', 'Trupp 1 hat Ebene 7');
    expect(removeNote('e1', { text: 'Trupp 1' })).toMatchObject({ ok: false, reason: 'ambiguous' });
    expect(loadMemory('e1').notes).toHaveLength(2);
  });

  it('meldet einen fehlenden Treffer', () => {
    addNote('e1', 'Ebene 7');
    expect(removeNote('e1', { text: 'Drehleiter' })).toMatchObject({ ok: false, reason: 'notFound' });
  });

  it('vergisst alle Notizen, behält aber das vorige Gespräch', () => {
    addNote('e1', 'Ebene 7');
    saveConversation('e1', [{ heard: 'hallo', answer: 'Servus' }]);
    clearNotes('e1');
    const memory = loadMemory('e1');
    expect(memory.notes).toEqual([]);
    expect(memory.lastConversation?.exchanges).toHaveLength(1);
  });

  it('kürzt das Gespräch auf die letzten zehn Wechsel und lange Texte', () => {
    const exchanges = Array.from({ length: 14 }, (_, i) => ({
      heard: `Satz ${i} ${'x'.repeat(300)}`,
      answer: `Antwort ${i} ${'y'.repeat(400)}`,
      tools: ['createMarker → Messung'],
    }));
    saveConversation('e1', exchanges, localStorage, NOW);
    const saved = loadMemory('e1', localStorage, NOW).lastConversation!;
    expect(saved.endedAt).toBe(NOW.toISOString());
    expect(saved.exchanges).toHaveLength(10);
    expect(saved.exchanges[0].heard.startsWith('Satz 4')).toBe(true);
    expect(saved.exchanges[0].heard.length).toBeLessThanOrEqual(200);
    expect(saved.exchanges[0].answer.length).toBeLessThanOrEqual(300);
  });

  it('speichert ein leeres Gespräch nicht', () => {
    saveConversation('e1', [{ heard: 'alt', answer: 'alt' }]);
    saveConversation('e1', []);
    expect(loadMemory('e1').lastConversation?.exchanges[0].heard).toBe('alt');
  });

  it('verwirft Einträge anderer Einsätze nach sieben Tagen', () => {
    addNote('alt', 'vergessen', localStorage, new Date(NOW.getTime() - 8 * DAY));
    addNote('jung', 'bleibt', localStorage, new Date(NOW.getTime() - 2 * DAY));
    loadMemory('e1', localStorage, NOW);
    expect(localStorage.getItem(memoryKey('alt'))).toBeNull();
    expect(localStorage.getItem(memoryKey('jung'))).not.toBeNull();
  });

  it('verwirft kaputtes JSON und fremde Fassungen', () => {
    localStorage.setItem(memoryKey('e1'), '{kaputt');
    expect(loadMemory('e1').notes).toEqual([]);
    localStorage.setItem(memoryKey('e1'), JSON.stringify({ version: 99, notes: [{ text: 'x' }] }));
    expect(loadMemory('e1').notes).toEqual([]);
  });

  it('läuft ohne nutzbaren Speicher weiter', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
      key: () => null,
      length: 0,
      clear: () => undefined,
    } as Storage;
    expect(loadMemory('e1', broken).notes).toEqual([]);
    expect(addNote('e1', 'Ebene 7', broken)).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(() => saveConversation('e1', [{ heard: 'a', answer: 'b' }], broken)).not.toThrow();
  });

  it('meldet Änderungen an Abonnenten', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMemory(listener);
    addNote('e1', 'Ebene 7');
    expect(listener).toHaveBeenCalledWith('e1');
    unsubscribe();
    addNote('e1', 'Trupp 1');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('runMemoryCommand', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('bestätigt eine neue Notiz und nennt die Liste', () => {
    const result = runMemoryCommand('e1', { action: 'add', text: 'Messwerte: Trupp 1, Ebene 7' });
    expect(result.success).toBe(true);
    expect(result.message).toContain('Trupp 1, Ebene 7');
    expect(result.notes).toHaveLength(1);
  });

  it('fragt bei vollem Gedächtnis nach, welche Notiz weg soll', () => {
    for (let i = 0; i < MAX_NOTES; i++) addNote('e1', `Notiz ${i}`);
    const result = runMemoryCommand('e1', { action: 'add', text: 'noch eine' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('Notiz 0');
  });

  it('nennt bei fehlendem Treffer die vorhandenen Notizen', () => {
    addNote('e1', 'Ebene 7');
    const result = runMemoryCommand('e1', { action: 'remove', text: 'Drehleiter' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('Ebene 7');
  });

  it('vergisst alles', () => {
    addNote('e1', 'Ebene 7');
    const result = runMemoryCommand('e1', { action: 'clear' });
    expect(result.success).toBe(true);
    expect(loadMemory('e1').notes).toEqual([]);
  });

  it('ohne Einsatz gibt es kein Gedächtnis', () => {
    expect(runMemoryCommand(undefined, { action: 'add', text: 'x' }).success).toBe(false);
  });

  it('lehnt eine unbekannte Aktion ab', () => {
    expect(runMemoryCommand('e1', { action: 'foo' as 'add' }).success).toBe(false);
  });
});

describe('describeToolCall', () => {
  it('nennt das Werkzeug und den Namen des Elements, sonst nichts', () => {
    expect(describeToolCall({ name: 'createMarker', args: { name: 'Messung', lat: 47 } })).toBe(
      'createMarker → Messung',
    );
    expect(describeToolCall({ name: 'findItems', args: { type: 'marker' } })).toBe('findItems');
  });
});
