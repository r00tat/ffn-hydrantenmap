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
}));

vi.mock('./useMapEditor', () => ({
  useHistoryPathSegments: vi.fn(() => []),
}));

vi.mock('../components/actions/maps/places', () => ({
  searchPlace: vi.fn(),
}));

import useAiAssistant from './useAiAssistant';

describe('useAiAssistant', () => {
  it('renders without error when no MapContainer is present', () => {
    expect(() => {
      renderHook(() => useAiAssistant([]));
    }).not.toThrow();
  });
});
