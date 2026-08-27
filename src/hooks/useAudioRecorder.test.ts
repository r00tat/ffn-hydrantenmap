// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import useAudioRecorder from './useAudioRecorder';
import { AUDIO_BITS_PER_SECOND } from './constants';

const constructorCalls: Array<[MediaStream, MediaRecorderOptions | undefined]> = [];

class FakeMediaRecorder {
  state = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    constructorCalls.push([stream, options]);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

beforeEach(() => {
  constructorCalls.length = 0;
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({ getTracks: () => [] }) as unknown as MediaStream),
    },
  });
});

describe('useAudioRecorder', () => {
  it('nimmt mit sprachtauglicher Bitrate auf statt mit der Vorgabe des Browsers', async () => {
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0][1]).toEqual({
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });
    // Der Browser nimmt sonst mit rund 156 kbit/s auf — ein Vielfaches dessen,
    // was Sprache braucht.
    expect(AUDIO_BITS_PER_SECOND).toBeLessThanOrEqual(48000);
  });
});
