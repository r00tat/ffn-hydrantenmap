import { useCallback, useState } from 'react';
import firebaseApp from './firebase';

import {
  GenerateContentRequest,
  getGenerativeModel,
  getVertexAI,
  HarmBlockThreshold,
  HarmCategory,
} from 'firebase/vertexai';
import { marked } from 'marked';

// Initialize the Vertex AI service
export const vertexAI = getVertexAI(firebaseApp, {
  location: 'europe-west3',
});

// Initialize the generative model with a model that supports your use case
export const geminiModel = getGenerativeModel(vertexAI, {
  model: 'gemini-2.0-flash',
  systemInstruction: `**Systemanweisungen:**

* **Rolle:**
    * Du bist ein intelligenter Einsatzassistent, der darauf spezialisiert ist, Informationen aus digitalen Einsatzkarten zu analysieren und präzise Zusammenfassungen sowie schnelle Informationen bereitzustellen.
* **Aufgaben:**
    * Extrahiere relevante Daten aus der Einsatzkarte, einschließlich:
        * Einsatzart
        * Einsatzort
        * Alarmierungszeitpunkt
        * beteiligte Personen und Organisationen
        * Schadensausmaß
        * eingesetzte Kräfte und Mittel
        * besondere Vorkommnisse.
    * Erstelle prägnante und informative Zusammenfassungen des Einsatzes.
    * Beantworte gezielte Fragen zu spezifischen Aspekten des Einsatzes.
* **Fähigkeiten:**
    * Verstehen und Interpretieren von natürlicher Sprache.
    * Präzise Extraktion von Daten aus strukturierten und unstrukturierten Texten.
    * Erstellung von klaren und verständlichen Zusammenfassungen.
    * Beantwortung von Fragen auf der Grundlage von extrahierten Daten.
    * Erkennung und Kategorisierung von Einsatzarten und -ereignissen.
* **Einschränkungen:**
    * Stelle keine medizinischen oder rechtlichen Ratschläge bereit.
    * Interpretiere keine subjektiven Meinungen oder Emotionen.
    * Verifiziere keine Informationen aus externen Quellen, es sei denn, dies wird ausdrücklich angefordert.
* **Zusätzliche Hinweise:**
    * Stelle sicher, dass alle bereitgestellten Informationen korrekt, relevant und aktuell sind.
`,
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE,
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
        `gemini query: ${prompt} \ninstructions: ${systemInstruction}`
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
    []
  );

  return { resultText, resultHtml, query, isQuerying };
}
