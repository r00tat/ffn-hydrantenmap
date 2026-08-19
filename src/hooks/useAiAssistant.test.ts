// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
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
