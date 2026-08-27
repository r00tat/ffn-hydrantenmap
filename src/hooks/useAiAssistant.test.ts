// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({}));
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  })),
}));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  signOut: vi.fn(),
}));

vi.mock('../components/firebase/firebase', () => ({
  firestore: {},
}));

vi.mock('../components/firebase/firestore', () => ({
  FIRECALL_COLLECTION_ID: 'call',
  FIRECALL_ITEMS_COLLECTION_ID: 'item',
}));

vi.mock('../components/firebase/vertexai', () => ({
  geminiModel: { generateContent: vi.fn() },
}));

vi.mock('../components/firebase/aiTools', () => ({
  AI_SYSTEM_PROMPT: 'test',
  AI_TOOL_DECLARATIONS: [],
}));

vi.mock('./useFirecallItemAdd', () => ({
  default: vi.fn(() => vi.fn()),
}));

vi.mock('./useFirecallItemUpdate', () => ({
  default: vi.fn(() => vi.fn()),
}));

vi.mock('./useFirecall', () => ({
  useFirecallId: vi.fn(() => 'test-firecall'),
  useFirecall: vi.fn(() => ({ id: 'test-firecall', name: 'Test' })),
}));

vi.mock('./useMapEditor', () => ({
  useHistoryPathSegments: vi.fn(() => []),
}));

vi.mock('../components/actions/maps/places', () => ({
  searchPlace: vi.fn(),
}));

vi.mock('./aiAssistant/toolHandlers', () => ({
  executeToolCall: vi.fn(),
}));

import useAiAssistant from './useAiAssistant';

describe('useAiAssistant', () => {
  it('renders without error when no MapContainer is present', () => {
    expect(() => {
      renderHook(() => useAiAssistant([]));
    }).not.toThrow();
  });
});

describe('useAiAssistant loop exhaustion', () => {
  it('falls back to the last successful tool result instead of an error', async () => {
    const { geminiModel } = await import('../components/firebase/vertexai');
    const { executeToolCall } = await import('./aiAssistant/toolHandlers');

    // Ein Modell, das nie aufhört, Werkzeuge aufzurufen.
    (geminiModel.generateContent as any).mockResolvedValue({
      response: {
        candidates: [{ content: { role: 'model', parts: [] } }],
        functionCalls: () => [{ name: 'searchWaterSupply', args: {} }],
        text: () => '',
      },
    });
    (executeToolCall as any).mockResolvedValue({
      success: true,
      message: 'Nächste Entnahmestelle: Überflurhydrant ÖH 12, 120 m nördlich',
      data: { answer: 'Nächste Entnahmestelle: Überflurhydrant ÖH 12' },
    });

    const { result } = renderHook(() => useAiAssistant([]));
    const answer = await result.current.processText('wo ist der nächste hydrant');

    expect(answer.success).toBe(true);
    expect(answer.message).toContain('ÖH 12');
  });
});

describe('useAiAssistant Gedächtnis', () => {
  beforeEach(async () => {
    const { geminiModel } = await import('../components/firebase/vertexai');
    (geminiModel.generateContent as any).mockReset();
  });

  /** Ein Modell, das ohne Werkzeugaufruf antwortet — ein Durchlauf, fertig. */
  async function mockPlainAnswer(text: string) {
    const { geminiModel } = await import('../components/firebase/vertexai');
    (geminiModel.generateContent as any).mockResolvedValue({
      response: {
        candidates: [{ content: { role: 'model', parts: [{ text }] } }],
        functionCalls: () => [],
        text: () => text,
      },
    });
  }

  it('behält die Historie über eine Folgefrage hinweg', async () => {
    await mockPlainAnswer('Verstanden');
    const { geminiModel } = await import('../components/firebase/vertexai');

    const { result } = renderHook(() => useAiAssistant([]));
    await result.current.processText('erster Befehl');
    await result.current.processText('und jetzt noch einmal');

    const secondRequest = (geminiModel.generateContent as any).mock.calls[1][0];
    // Erster Benutzerbeitrag, Antwort des Modells, neuer Benutzerbeitrag
    expect(secondRequest.contents.length).toBeGreaterThan(1);
    expect(JSON.stringify(secondRequest.contents)).toContain('erster Befehl');
  });

  it('vergisst die Historie erst nach dem Zeitfenster ab Ende der letzten Antwort', async () => {
    await mockPlainAnswer('Verstanden');
    const { geminiModel } = await import('../components/firebase/vertexai');
    const { MEMORY_TIMEOUT_MS } = await import('./aiAssistant/types');

    const { result } = renderHook(() => useAiAssistant([]));
    const nowSpy = vi.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_000_000);
    await result.current.processText('erster Befehl');

    // Knapp innerhalb des Fensters: die Historie steht noch
    nowSpy.mockReturnValue(1_000_000 + MEMORY_TIMEOUT_MS - 1000);
    await result.current.processText('kurz danach');
    expect(
      JSON.stringify((geminiModel.generateContent as any).mock.calls[1][0].contents)
    ).toContain('erster Befehl');

    // Deutlich danach: die Historie ist weg
    nowSpy.mockReturnValue(1_000_000 + 5 * MEMORY_TIMEOUT_MS);
    await result.current.processText('viel später');
    const thirdRequest = (geminiModel.generateContent as any).mock.calls[2][0];
    expect(JSON.stringify(thirdRequest.contents)).not.toContain('erster Befehl');

    nowSpy.mockRestore();
  });

  it('rechnet das Zeitfenster ab dem Ende der Antwort, nicht ab ihrem Beginn', async () => {
    const { geminiModel } = await import('../components/firebase/vertexai');
    const { MEMORY_TIMEOUT_MS } = await import('./aiAssistant/types');
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);

    // Eine Antwort, die selbst länger dauert als das Zeitfenster — beim
    // Sprach-Assistenten sind zwölf Sekunden normal, ein zäher Einsatz mit
    // mehreren Werkzeugaufrufen kann deutlich länger brauchen.
    (geminiModel.generateContent as any).mockImplementation(async () => {
      nowSpy.mockReturnValue((Date.now() as number) + MEMORY_TIMEOUT_MS + 30_000);
      return {
        response: {
          candidates: [{ content: { role: 'model', parts: [{ text: 'Verstanden' }] } }],
          functionCalls: () => [],
          text: () => 'Verstanden',
        },
      };
    });

    const { result } = renderHook(() => useAiAssistant([]));
    await result.current.processText('erster Befehl');

    // Der Benutzer spricht zehn Sekunden nach der Antwort weiter
    nowSpy.mockReturnValue((Date.now() as number) + 10_000);
    await result.current.processText('und weiter');

    const secondRequest = (geminiModel.generateContent as any).mock.calls[1][0];
    expect(JSON.stringify(secondRequest.contents)).toContain('erster Befehl');
    nowSpy.mockRestore();
  });

  it('meldet keinen Gedächtnisverlust, wenn es nichts zu vergessen gibt', async () => {
    await mockPlainAnswer('Verstanden');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { result } = renderHook(() => useAiAssistant([]));
    await result.current.processText('erster Befehl überhaupt');

    expect(
      info.mock.calls.some((args) => String(args[0]).includes('Memory timeout'))
    ).toBe(false);
    info.mockRestore();
  });
});

describe('useAiAssistant Denkaufwand', () => {
  it('begrenzt das Nachdenken des Modells auf die niedrige Stufe', async () => {
    const { geminiModel } = await import('../components/firebase/vertexai');
    (geminiModel.generateContent as any).mockReset();
    (geminiModel.generateContent as any).mockResolvedValue({
      response: {
        candidates: [{ content: { role: 'model', parts: [{ text: 'Verstanden' }] } }],
        functionCalls: () => [],
        text: () => 'Verstanden',
      },
    });

    const { result } = renderHook(() => useAiAssistant([]));
    await result.current.processText('Fahrzeug eintragen');

    const request = (geminiModel.generateContent as any).mock.calls[0][0];
    expect(request.generationConfig?.thinkingConfig?.thinkingLevel).toBe('LOW');
  });
});

describe('useAiAssistant Sprachbefehl', () => {
  it('schickt das Audio direkt in den Werkzeug-Aufruf, ohne Transkriptionsschritt', async () => {
    const { geminiModel } = await import('../components/firebase/vertexai');
    (geminiModel.generateContent as any).mockReset();
    (geminiModel.generateContent as any).mockResolvedValue({
      response: {
        candidates: [{ content: { role: 'model', parts: [{ text: 'Eingetragen' }] } }],
        functionCalls: () => [],
        text: () => 'Eingetragen',
      },
    });

    const { result } = renderHook(() => useAiAssistant([]));
    await result.current.processAudio('AAAABBBBCCCC');

    expect((geminiModel.generateContent as any)).toHaveBeenCalledTimes(1);
    // contents wird im Verlauf der Schleife weitergeschrieben, der
    // Benutzerbeitrag steht am Anfang.
    const parts = (geminiModel.generateContent as any).mock.calls[0][0].contents[0].parts;
    expect(parts[0]).toEqual({
      inlineData: { mimeType: 'audio/webm', data: 'AAAABBBBCCCC' },
    });
  });

  it('schickt das Audio nicht noch einmal in den zweiten Roundtrip', async () => {
    const { geminiModel } = await import('../components/firebase/vertexai');
    const { executeToolCall } = await import('./aiAssistant/toolHandlers');
    (geminiModel.generateContent as any).mockReset();
    (executeToolCall as any).mockResolvedValue({ success: true, message: 'Tagebucheintrag erstellt' });

    // Erster Durchlauf ruft ein Werkzeug auf, zweiter formuliert die Antwort.
    (geminiModel.generateContent as any)
      .mockResolvedValueOnce({
        response: {
          candidates: [{ content: { role: 'model', parts: [] } }],
          functionCalls: () => [{ name: 'createDiary', args: { name: 'Meldung' } }],
          text: () => '',
        },
      })
      .mockResolvedValueOnce({
        response: {
          candidates: [{ content: { role: 'model', parts: [{ text: 'Eingetragen' }] } }],
          functionCalls: () => [],
          text: () => 'Eingetragen',
        },
      });

    const { result } = renderHook(() => useAiAssistant([]));
    await result.current.processAudio('AAAABBBBCCCC');

    // Der zweite Aufruf trägt nur noch den Platzhalter — das Audio ein zweites
    // Mal hochzuladen kostete in der Messung zu #740 gut zwei Sekunden.
    const secondRequest = (geminiModel.generateContent as any).mock.calls[1][0];
    expect(JSON.stringify(secondRequest.contents)).not.toContain('AAAABBBBCCCC');
    expect(JSON.stringify(secondRequest.contents)).toContain('[Sprachbefehl]');
  });

  it('behält das Audio nicht in der Historie', async () => {
    const { geminiModel } = await import('../components/firebase/vertexai');
    (geminiModel.generateContent as any).mockReset();
    (geminiModel.generateContent as any).mockResolvedValue({
      response: {
        candidates: [{ content: { role: 'model', parts: [{ text: 'Eingetragen' }] } }],
        functionCalls: () => [],
        text: () => 'Eingetragen',
      },
    });

    const { result } = renderHook(() => useAiAssistant([]));
    await result.current.processAudio('AAAABBBBCCCC');
    await result.current.processText('und noch eine Frage');

    const secondRequest = (geminiModel.generateContent as any).mock.calls[1][0];
    expect(JSON.stringify(secondRequest.contents)).not.toContain('AAAABBBBCCCC');
    expect(JSON.stringify(secondRequest.contents)).toContain('[Sprachbefehl]');
  });
});
