'use client';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useRef, useState } from 'react';
import useAudioRecorder from '../../hooks/useAudioRecorder';
import useAiAssistant from '../../hooks/useAiAssistant';
import { FirecallItem } from '../firebase/firestore';
import AiActionToast, { AiToastState } from './AiActionToast';
import { speakMessage } from '../../common/speech';

interface AiAssistantButtonProps {
  firecallItems: FirecallItem[];
}

const MAX_RECORDING_TIME_MS = 30000;

// Audio feedback using Web Audio API
function playBeep(frequency: number, duration: number, type: OscillatorType = 'sine') {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  } catch (e) {
    // Audio not supported, fail silently
  }
}

function playStartBeep() {
  playBeep(880, 0.15); // High A note - short beep for start
}

function playStopBeep() {
  playBeep(440, 0.1); // Lower A note
  setTimeout(() => playBeep(660, 0.15), 100); // Then higher - two-tone for stop
}

export default function AiAssistantButton({ firecallItems }: AiAssistantButtonProps) {
  const { state: recorderState, startRecording, stopRecording, error: recorderError } = useAudioRecorder();
  const { processAudio, undoLastAction } = useAiAssistant(firecallItems);

  const [toast, setToast] = useState<AiToastState>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  const maxRecordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Show recorder errors - reacting to external state change from hook
  useEffect(() => {
    if (recorderError) {
      setToast({
        open: true,
        message: recorderError,
        severity: 'error',
      });
      speakMessage(recorderError);
    }
  }, [recorderError]);

  const handleClick = useCallback(async (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();

    if (recorderState === 'recording') {
      // Stop recording
      if (maxRecordingTimerRef.current) {
        clearTimeout(maxRecordingTimerRef.current);
        maxRecordingTimerRef.current = null;
      }

      playStopBeep();
      const audio = await stopRecording();
      if (!audio) return;

      setIsAiProcessing(true);
      try {
        const result = await processAudio(audio);
        setToast({
          open: true,
          message: result.message,
          severity: result.success ? 'success' : result.clarification ? 'warning' : 'error',
          showUndo: result.success && !!result.createdItemId,
          clarificationOptions: result.clarification?.options,
        });
        // Speak answers from the AI
        if (result.isAnswer && result.message) {
          speakMessage(result.message);
        }
      } finally {
        setIsAiProcessing(false);
      }
    } else {
      // Start recording
      playStartBeep();
      await startRecording();

      // Auto-stop after max recording time
      maxRecordingTimerRef.current = setTimeout(async () => {
        playStopBeep();
        const audio = await stopRecording();
        if (audio) {
          setIsAiProcessing(true);
          try {
            const result = await processAudio(audio);
            setToast({
              open: true,
              message: result.message,
              severity: result.success ? 'success' : result.clarification ? 'warning' : 'error',
              showUndo: result.success && !!result.createdItemId,
              clarificationOptions: result.clarification?.options,
            });
            // Speak answers from the AI
            if (result.isAnswer && result.message) {
              speakMessage(result.message);
            }
          } finally {
            setIsAiProcessing(false);
          }
        }
      }, MAX_RECORDING_TIME_MS);
    }
  }, [processAudio, recorderState, startRecording, stopRecording]);

  const handleToastClose = useCallback(() => {
    setToast((prev) => ({ ...prev, open: false }));
  }, []);

  const handleUndo = useCallback(async () => {
    const success = await undoLastAction();
    if (success) {
      setToast({
        open: true,
        message: 'Rückgängig gemacht',
        severity: 'success',
      });
    }
  }, [undoLastAction]);

  const isRecording = recorderState === 'recording';
  const isProcessing = recorderState === 'processing' || isAiProcessing;
  const statusText = isRecording ? 'Aufnahme...' : isProcessing ? 'Verarbeitung...' : null;

  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          bottom: 148,
          right: 16,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 1,
          zIndex: 1000,
        }}
      >
        {statusText && (
          <Typography
            variant="body2"
            sx={{
              backgroundColor: isRecording ? 'error.main' : 'primary.main',
              color: 'white',
              px: 1.5,
              py: 0.5,
              borderRadius: 2,
              whiteSpace: 'nowrap',
              fontWeight: 'medium',
              fontSize: '0.875rem',
              boxShadow: 2,
            }}
          >
            {statusText}
          </Typography>
        )}
        <Tooltip title={isRecording ? 'Klicken zum Stoppen' : 'KI-Assistent (klicken zum Sprechen)'}>
          <Fab
            color={isRecording ? 'error' : 'default'}
            aria-label="AI assistant"
            size="small"
            onClick={handleClick}
            disabled={isProcessing}
            sx={{
              animation: isRecording ? 'pulse 1s infinite' : 'none',
              '@keyframes pulse': {
                '0%': { boxShadow: '0 0 0 0 rgba(244, 67, 54, 0.4)' },
                '70%': { boxShadow: '0 0 0 10px rgba(244, 67, 54, 0)' },
                '100%': { boxShadow: '0 0 0 0 rgba(244, 67, 54, 0)' },
              },
            }}
          >
            {isProcessing ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              <AutoAwesomeIcon />
            )}
          </Fab>
        </Tooltip>
      </Box>
      <AiActionToast
        state={toast}
        onClose={handleToastClose}
        onUndo={handleUndo}
      />
    </>
  );
}
