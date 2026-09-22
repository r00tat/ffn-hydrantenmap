// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { actAsync } from '../../test-utils/actHelpers';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({}));
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({ handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() })),
}));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  signOut: vi.fn(),
}));

vi.mock('../../components/firebase/firebase', () => ({ firestore: {} }));
vi.mock('../../components/firebase/firestore', () => ({
  FIRECALL_COLLECTION_ID: 'call',
  FIRECALL_ITEMS_COLLECTION_ID: 'item',
}));
vi.mock('../../components/firebase/aiTools', () => ({
  AI_SYSTEM_PROMPT: 'test',
  AI_TOOL_DECLARATIONS: [],
}));
vi.mock('../useFirecallItemAdd', () => ({ default: vi.fn(() => vi.fn()) }));
vi.mock('../useFirecallItemUpdate', () => ({ default: vi.fn(() => vi.fn()) }));
vi.mock('../useFirecall', () => ({
  useFirecallId: vi.fn(() => 'test-firecall'),
  useFirecall: vi.fn(() => ({ id: 'test-firecall', name: 'Test' })),
}));
vi.mock('../useMapEditor', () => ({ useHistoryPathSegments: vi.fn(() => []) }));
vi.mock('../../components/actions/maps/places', () => ({ searchPlace: vi.fn() }));
vi.mock('./toolHandlers', () => ({ executeToolCall: vi.fn() }));

const capture = { stop: vi.fn().mockResolvedValue(undefined) };
const playback = {
  enqueue: vi.fn(),
  interrupt: vi.fn(),
  whenDrained: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('./liveAudio', () => ({
  isLiveAudioSupported: () => true,
  startMicrophoneCapture: vi.fn(async () => capture),
  LivePlayback: vi.fn(function LivePlaybackMock() {
    return playback;
  }),
}));

const session = {
  isClosed: false,
  send: vi.fn().mockResolvedValue(undefined),
  sendAudioRealtime: vi.fn().mockResolvedValue(undefined),
  sendFunctionResponses: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  receive: vi.fn(),
};

const connect = vi.fn(async (token: string, model: string) => {
  void token;
  void model;
  return session;
});
vi.mock('./liveConnection', () => ({
  connectLiveSession: (token: string, model: string) => connect(token, model),
}));

const createLiveToken = vi.fn(async () => ({
  token: 'auth_tokens/abc',
  model: 'gemini-live',
}));
vi.mock('../../app/actions/aiLiveToken', () => ({
  createLiveToken: () => createLiveToken(),
}));

import useAiLiveAssistant from './useAiLiveAssistant';

function answerWith(text: string) {
  session.receive.mockImplementation(async function* () {
    yield { type: 'serverContent', outputTranscription: { text }, turnComplete: true };
  });
}

describe('useAiLiveAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.isClosed = false;
    connect.mockResolvedValue(session);
    createLiveToken.mockResolvedValue({ token: 'auth_tokens/abc', model: 'gemini-live' });
    answerWith('Erledigt.');
  });

  it('schickt den Kartenkontext frisch mit dem Abschluss des Befehls', async () => {
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await actAsync(() => result.current.startTurn());
    const answer = await actAsync(() => result.current.finishTurn());

    expect(answer.message).toBe('Erledigt.');
    const [parts, turnComplete] = session.send.mock.calls[0];
    expect(parts[0].text).toContain('mapCenter');
    expect(parts[1].text).toContain('Befehl des Benutzers');
    expect(turnComplete).toBe(true);
  });

  it('schaltet das Mikrofon vor dem Abschluss ab, die Wiedergabe erst danach', async () => {
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await actAsync(() => result.current.startTurn());
    await actAsync(() => result.current.finishTurn());

    expect(capture.stop).toHaveBeenCalled();
    expect(capture.stop.mock.invocationCallOrder[0]).toBeLessThan(
      session.send.mock.invocationCallOrder[0],
    );
    expect(playback.whenDrained).toHaveBeenCalled();
    expect(playback.whenDrained.mock.invocationCallOrder[0]).toBeLessThan(
      playback.close.mock.invocationCallOrder[0],
    );
  });

  it('schließt die Sitzung nach dem Befehl wieder', async () => {
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await actAsync(() => result.current.startTurn());
    await actAsync(() => result.current.finishTurn());

    expect(session.close).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('meldet einen Fehler, wenn ohne Sitzung abgeschlossen wird', async () => {
    const { result } = renderHook(() => useAiLiveAssistant([]));

    const answer = await actAsync(() => result.current.finishTurn());

    expect(answer.success).toBe(false);
    expect(session.send).not.toHaveBeenCalled();
  });

  it('gibt einen gescheiterten Verbindungsaufbau nach außen weiter', async () => {
    connect.mockRejectedValueOnce(new Error('api not enabled'));
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await expect(actAsync(() => result.current.startTurn())).rejects.toThrow('api not enabled');
    expect(result.current.status).toBe('idle');
  });

  it('holt das Token vom Server und verbindet erst damit', async () => {
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await actAsync(() => result.current.startTurn());

    expect(createLiveToken).toHaveBeenCalled();
    expect(connect).toHaveBeenCalledWith('auth_tokens/abc', 'gemini-live');
  });

  it('verbindet gar nicht erst, wenn der Server kein Token ausgibt', async () => {
    createLiveToken.mockResolvedValueOnce({ error: 'quota' } as never);
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await expect(actAsync(() => result.current.startTurn())).rejects.toThrow('quota');
    expect(connect).not.toHaveBeenCalled();
  });

  it('räumt die Sitzung auf, wenn das Mikrofon nicht startet', async () => {
    const { startMicrophoneCapture } = await import('./liveAudio');
    (startMicrophoneCapture as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('NotAllowedError'),
    );
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await expect(actAsync(() => result.current.startTurn())).rejects.toThrow('NotAllowedError');
    expect(session.close).toHaveBeenCalled();
  });
});
