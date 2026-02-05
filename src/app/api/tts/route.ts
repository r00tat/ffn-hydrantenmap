import { NextRequest, NextResponse } from 'next/server';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

const client = new TextToSpeechClient();

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    // Limit text length to prevent abuse
    if (text.length > 1000) {
      return NextResponse.json({ error: 'Text too long' }, { status: 400 });
    }

    const [response] = await client.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode: 'de-DE',
        name: 'de-DE-Neural2-B', // Natural male voice
        ssmlGender: 'MALE',
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.1,
        pitch: 0,
      },
    });

    if (!response.audioContent) {
      return NextResponse.json({ error: 'No audio generated' }, { status: 500 });
    }

    // Return base64 encoded audio
    const audioBase64 =
      typeof response.audioContent === 'string'
        ? response.audioContent
        : Buffer.from(response.audioContent).toString('base64');

    return NextResponse.json({ audio: audioBase64 });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json(
      { error: 'Failed to generate speech' },
      { status: 500 }
    );
  }
}
