'use client';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { SxProps, Theme } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import useAudioRecorder from '../../hooks/useAudioRecorder';
import useAiAssistant from '../../hooks/useAiAssistant';
import { useHoseLineDraft } from '../../hooks/useHoseLineDraft';
import { FirecallItem } from '../firebase/firestore';
import type { AiAssistantResult } from '../../hooks/aiAssistant/types';
import AiActionToast, { AiToastState } from './AiActionToast';
import { speakMessage } from '../../common/speech';
import { LatencyRun, startLatencyRun } from '../../hooks/aiAssistant/latency';

interface AiAssistantButtonProps {
  firecallItems: FirecallItem[];
  containerSx?: SxProps<Theme>;
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

export default function AiAssistantButton({ firecallItems, containerSx }: AiAssistantButtonProps) {
  const t = useTranslations('ai');
  const { state: recorderState, startRecording, stopRecording, error: recorderError } = useAudioRecorder();
  const { processAudio, processText, undoLastAction, processingStatus } = useAiAssistant(firecallItems);
  const { confirmAllDrafts, discardAllDrafts } = useHoseLineDraft();

  const [toast, setToast] = useState<AiToastState>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  const maxRecordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showResult = useCallback(async (result: AiAssistantResult, run?: LatencyRun) => {
    setToast({
      open: true,
      message: result.message,
      severity: result.success ? 'success' : result.clarification ? 'warning' : 'error',
      showUndo: result.success && !!result.createdItemId,
      clarificationOptions: result.clarification?.options,
      draftCount: result.drafts?.length ?? 0,
    });
    run?.mark('antwort angezeigt');
    // Speak answers from the AI
    if (result.isAnswer && result.message) {
      // Bis zur Sprachausgabe wartet der Benutzer weiter — deshalb gehört
      // auch dieser Schritt in die Messung (Issue #740).
      await (run
        ? run.phase('sprachausgabe', () => speakMessage(result.message), {
            zeichen: result.message.length,
          })
        : speakMessage(result.message));
    }
    run?.finish();
  }, []);

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

      // Der Lauf beginnt hier, weil ab hier gewartet wird — alles davor ist
      // Aufnahmezeit und zählt nicht zur Latenz (Issue #740).
      const run = startLatencyRun('sprachbefehl');
      playStopBeep();
      const audio = await run.phase('aufnahme abschließen', () => stopRecording());
      if (!audio) {
        run.finish();
        return;
      }

      setIsAiProcessing(true);
      try {
        await showResult(await processAudio(audio, run), run);
      } finally {
        setIsAiProcessing(false);
      }
    } else {
      // Start recording
      playStartBeep();
      await startRecording();

      // Auto-stop after max recording time
      maxRecordingTimerRef.current = setTimeout(async () => {
        const run = startLatencyRun('sprachbefehl (zeitlimit)');
        playStopBeep();
        const audio = await run.phase('aufnahme abschließen', () => stopRecording());
        if (!audio) {
          run.finish();
          return;
        }
        setIsAiProcessing(true);
        try {
          await showResult(await processAudio(audio, run), run);
        } finally {
          setIsAiProcessing(false);
        }
      }, MAX_RECORDING_TIME_MS);
    }
  }, [processAudio, recorderState, showResult, startRecording, stopRecording]);

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

  const handleClarificationSelect = useCallback(async (option: string) => {
    const run = startLatencyRun('rückfrage beantwortet');
    setIsAiProcessing(true);
    try {
      await showResult(await processText(option, run), run);
    } finally {
      setIsAiProcessing(false);
    }
  }, [processText, showResult]);

  const handleDraftConfirm = useCallback(async () => {
    try {
      const created = await confirmAllDrafts();
      if (created > 0) {
        setToast({
          open: true,
          message: t('draftAdded', { count: created }),
          severity: 'success',
        });
      }
    } catch {
      // Was schon angelegt wurde, bleibt; der Rest steht weiter als Entwurf.
      setToast({ open: true, message: t('draftFailed'), severity: 'error' });
    }
  }, [confirmAllDrafts, t]);

  const handleDraftDiscard = useCallback(() => {
    discardAllDrafts();
  }, [discardAllDrafts]);

  const isRecording = recorderState === 'recording';
  const isProcessing = recorderState === 'processing' || isAiProcessing;

  const statusLabels: Record<string, string> = {
    analyzing: 'Analysiere...',
    executing: 'Führe aus...',
  };
  const statusText = isRecording
    ? 'Aufnahme...'
    : processingStatus !== 'idle'
      ? statusLabels[processingStatus]
      : isProcessing
        ? 'Verarbeitung...'
        : null;

  return (
    <>
      <Box
        sx={[
          {
            position: 'absolute',
            bottom: 172,
            right: 16,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 1,
            zIndex: 1000,
          },
          ...(Array.isArray(containerSx) ? containerSx : containerSx ? [containerSx] : []),
        ]}
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
          <span>
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
          </span>
        </Tooltip>
      </Box>
      <AiActionToast
        state={toast}
        onClose={handleToastClose}
        onUndo={handleUndo}
        onClarificationSelect={handleClarificationSelect}
        onDraftConfirm={handleDraftConfirm}
        onDraftDiscard={handleDraftDiscard}
      />
    </>
  );
}
