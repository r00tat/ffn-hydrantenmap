import { auth } from '../components/firebase/firebase';
import { stripMarkdownForSpeech } from './speechText';

let audioElement: HTMLAudioElement | null = null;

async function speakWithCloudTTS(message: string): Promise<boolean> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      return false;
    }

    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text: message }),
    });

    if (!response.ok) {
      return false;
    }

    const { audio } = await response.json();
    if (!audio) {
      return false;
    }

    // Stop any currently playing audio
    if (audioElement) {
      audioElement.pause();
      audioElement = null;
    }

    // Play the audio
    audioElement = new Audio(`data:audio/mp3;base64,${audio}`);
    await audioElement.play();
    return true;
  } catch (error) {
    console.warn('Cloud TTS failed:', error);
    return false;
  }
}

function speakWithBrowserTTS(message: string): void {
  if (!('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported');
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = 'de-DE';
  utterance.rate = 1.1;
  utterance.pitch = 1.0;

  window.speechSynthesis.speak(utterance);
}

export async function speakMessage(message: string): Promise<void> {
  // Beide Stimmen bekommen reinen Text und kennen kein Markdown — ohne das
  // liest die Ausgabe die Sternchen des Modells mit vor.
  const spoken = stripMarkdownForSpeech(message);
  if (!spoken) return;

  // Try Cloud TTS first, fall back to browser TTS
  const success = await speakWithCloudTTS(spoken);
  if (!success) {
    speakWithBrowserTTS(spoken);
  }
}

export function cancelSpeech(): void {
  // Cancel browser TTS
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  // Stop audio element
  if (audioElement) {
    audioElement.pause();
    audioElement = null;
  }
}
