import { useCallback, useEffect, useRef, useState } from 'react';

export type RecordingState = 'idle' | 'recording' | 'processing';

export interface AudioRecorderResult {
  state: RecordingState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  error: string | null;
}

export default function useAudioRecorder(): AudioRecorderResult {
  const [state, setState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Helper to stop all tracks and clean up stream
  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupStream();
    };
  }, [cleanupStream]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setState('recording');
    } catch (err) {
      setError('Mikrofon konnte nicht gestartet werden');
      console.error('Failed to start recording:', err);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        // Clean up stream even on early return
        cleanupStream();
        setState('idle');
        resolve(null);
        return;
      }

      mediaRecorder.onstop = async () => {
        setState('processing');

        // Stop all tracks
        cleanupStream();

        // Convert to base64
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          setState('idle');
          resolve(base64);
        };
        reader.onerror = () => {
          setError('Audio konnte nicht verarbeitet werden');
          setState('idle');
          resolve(null);
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.stop();
    });
  }, [cleanupStream]);

  return { state, startRecording, stopRecording, error };
}
