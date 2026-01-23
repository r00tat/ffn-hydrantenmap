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

const MIN_HOLD_TIME_MS = 500;
const MAX_RECORDING_TIME_MS = 30000;

export default function AiAssistantButton({ firecallItems }: AiAssistantButtonProps) {
  const { state: recorderState, startRecording, stopRecording, error: recorderError } = useAudioRecorder();
  const { processAudio, undoLastAction } = useAiAssistant(firecallItems);

  const [toast, setToast] = useState<AiToastState>({
    open: false,
    message: '',
    severity: 'success',
  });

  const holdStartRef = useRef<number>(0);
  const maxRecordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Show recorder errors - reacting to external state change from hook
  useEffect(() => {
    if (recorderError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToast({
        open: true,
        message: recorderError,
        severity: 'error',
      });
      speakMessage(recorderError);
    }
  }, [recorderError]);

  const handlePointerDown = useCallback(async () => {
    holdStartRef.current = Date.now();
    await startRecording();

    // Auto-stop after max recording time
    maxRecordingTimerRef.current = setTimeout(async () => {
      if (recorderState === 'recording') {
        const audio = await stopRecording();
        if (audio) {
          const result = await processAudio(audio);
          setToast({
            open: true,
            message: result.message,
            severity: result.success ? 'success' : result.clarification ? 'warning' : 'error',
            showUndo: result.success && !!result.createdItemId,
            clarificationOptions: result.clarification?.options,
          });
        }
      }
    }, MAX_RECORDING_TIME_MS);
  }, [processAudio, recorderState, startRecording, stopRecording]);

  const handlePointerUp = useCallback(async () => {
    // Clear max recording timer
    if (maxRecordingTimerRef.current) {
      clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }

    const holdDuration = Date.now() - holdStartRef.current;

    if (holdDuration < MIN_HOLD_TIME_MS) {
      // Too short - cancel recording without processing
      await stopRecording();
      setToast({
        open: true,
        message: 'Halte den Button länger gedrückt zum Sprechen',
        severity: 'warning',
      });
      return;
    }

    const audio = await stopRecording();
    if (!audio) return;

    const result = await processAudio(audio);
    setToast({
      open: true,
      message: result.message,
      severity: result.success ? 'success' : result.clarification ? 'warning' : 'error',
      showUndo: result.success && !!result.createdItemId,
      clarificationOptions: result.clarification?.options,
    });
  }, [processAudio, stopRecording]);

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
  const isProcessing = recorderState === 'processing';
  const statusText = isRecording ? 'Aufnahme...' : isProcessing ? 'Verarbeitung...' : null;

  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          bottom: 96,
          left: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Tooltip title="KI-Assistent (halten zum Sprechen)">
          <Fab
            color={isRecording ? 'error' : 'default'}
            aria-label="AI assistant"
            size="small"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
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
        {statusText && (
          <Typography
            variant="caption"
            sx={{
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              whiteSpace: 'nowrap',
            }}
          >
            {statusText}
          </Typography>
        )}
      </Box>
      <AiActionToast
        state={toast}
        onClose={handleToastClose}
        onUndo={handleUndo}
      />
    </>
  );
}
