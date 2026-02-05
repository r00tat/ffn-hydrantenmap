let audioElement: HTMLAudioElement | null = null;

async function speakWithCloudTTS(message: string): Promise<boolean> {
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  // Try Cloud TTS first, fall back to browser TTS
  const success = await speakWithCloudTTS(message);
  if (!success) {
    speakWithBrowserTTS(message);
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
