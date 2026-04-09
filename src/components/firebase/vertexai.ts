import { useCallback, useState } from 'react';
import firebaseApp from './firebase';

import {
  GenerateContentRequest,
  getAI,
  getGenerativeModel,
  HarmBlockThreshold,
  HarmCategory,
  VertexAIBackend,
} from 'firebase/ai';
import { marked } from 'marked';
import { GEMINI_MODEL } from '../../common/ai';

// Initialize the Vertex AI service
export const vertexAI = getAI(firebaseApp, {
  backend: new VertexAIBackend('global'),
});

// Initialize the generative model with a model that supports your use case
export const geminiModel = getGenerativeModel(vertexAI, {
  model: GEMINI_MODEL,
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
    },
  ],
});

export async function askGemini(prompt: string, systemInstruction?: string) {
  // To generate text output, call generateContent with the text input
  console.info(`gemini query: ${prompt}`);
  const request: GenerateContentRequest = {
    systemInstruction,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
  };

  const result = await geminiModel.generateContent(request);

  const response = result.response;
  const text = response.text();
  console.info(`gemini response: ${text}`);
  return text;
}

export function useAiQueryHook() {
  const [resultText, setResultText] = useState('');
  const [resultHtml, setResultHtml] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);

  const query = useCallback(
    async (prompt: string, systemInstruction?: string) => {
      console.info(
        `gemini query: ${prompt} \ninstructions: ${systemInstruction}`,
      );
      setResultText('');
      setResultHtml('');
      setIsQuerying(true);
      let text = '';
      const request: GenerateContentRequest = {
        systemInstruction,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      };
      const result = await geminiModel.generateContentStream(request);

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        console.log(chunkText);
        text += chunkText;
        setResultText(text);
        setResultHtml(await marked(text));
      }
      setIsQuerying(false);
      console.info(`final gemini result: ${text}`);
      return text;
    },
    [],
  );

  return { resultText, resultHtml, query, isQuerying };
}

export type { GenerateContentRequest } from 'firebase/ai';
