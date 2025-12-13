import { useState, useCallback, useRef } from 'react';
import { firebaseApp } from '../components/firebase/firebase';
import { vertexAI } from '../components/firebase/vertexai';
import {
  AudioConversationController,
  getLiveGenerativeModel,
  LiveSession,
  ResponseModality,
  startAudioConversation,
  Tool,
} from 'firebase/ai';

// Assuming a similar shape to other chat message types in the project
export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

/**
 * Hook for a persistent, live, bidirectional stream with Gemini.
 * This uses the `liveQuery` API.
 */
export const useLiveStreaming = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  const audioControllerRef = useRef<AudioConversationController | null>(null);
  const [responseText, setResponseText] = useState('');

  const startLiveChat = useCallback(
    async (tools?: Tool[], systemInstruction?: string) => {
      setError(null);
      setMessages([]);
      setResponseText('');

      // Ensure any existing connection is closed before starting a new one
      if (sessionRef.current) {
        sessionRef.current.close();
      }

      try {
        // Create a `LiveGenerativeModel` instance with a model that supports the Live API
        const liveModel = getLiveGenerativeModel(vertexAI, {
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          // tools,
          // Configure the model to respond with audio
          generationConfig: {
            responseModalities: [ResponseModality.TEXT],
          },
          systemInstruction,
        });

        const session: LiveSession = await liveModel.connect();
        sessionRef.current = session;

        const audioConversationController: AudioConversationController =
          await startAudioConversation(session);
        setIsConnected(true);

        audioControllerRef.current = audioConversationController;

        // Handle the model's audio or text output
        const messages = session.receive();
        for await (const message of messages) {
          switch (message.type) {
            case 'serverContent':
              if (message.turnComplete) {
                // TODO(developer): Handle turn completion
                console.info('turn complete');
              } else if (message.interrupted) {
                // TODO(developer): Handle the interruption
                console.info('interrupted');
                break;
              } else if (message.modelTurn) {
                const parts = message.modelTurn?.parts;
                parts?.forEach((part) => {
                  if (part.inlineData) {
                    // TODO(developer): Play the audio chunk
                    console.info('recieved audio?!?');
                  }
                  if (part.text) {
                    console.info('recieved text: ' + part.text);
                    setResponseText((prev) => prev + part.text);
                  }
                });
              }
              break;
            case 'toolCall':
              // Ignore
              console.info('tool call');
              break;
            case 'toolCallCancellation':
              // Ignore
              console.info('tool call cancellation');
              break;
          }
        }
      } catch (e: any) {
        setError(e);
      } finally {
        setIsConnected(false);
      }
    },
    []
  );

  const stopLiveChat = useCallback(async () => {
    if (audioControllerRef.current) {
      await audioControllerRef.current.stop();
    }
    setIsConnected(false);
    setMessages([]);
  }, []);

  return {
    messages,
    isConnected,
    error,
    startLiveChat,
    stopLiveChat,
    responseText,
  };
};
