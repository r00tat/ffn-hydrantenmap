// src/hooks/useSpeechToText.ts
import { useState, useCallback } from 'react';

interface Window {
  SpeechRecognition: any;
  webkitSpeechRecognition: any;
}

declare let window: Window;

export const useSpeechToText = () => {
  const [transcribedText, setTranscribedText] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState('');

  const startTranscription = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setIsTranscribing(true);
    setTranscribedText('');
    setError('');

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const speechResult = event.results[0][0].transcript;
      setTranscribedText(speechResult);
      setIsTranscribing(false);
    };

    recognition.onspeechend = () => {
      recognition.stop();
      setIsTranscribing(false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error', event.error);
      setError(`Error in speech recognition: ${event.error}`);
      setIsTranscribing(false);
    };

    recognition.start();
  }, []);

  const clear = useCallback(() => {
    setTranscribedText('');
    setError('');
  }, []);

  return { transcribedText, isTranscribing, startTranscription, error, clear };
};
