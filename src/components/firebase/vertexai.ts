import firebaseApp from './firebase';

import {
  getVertexAI,
  getGenerativeModel,
  HarmCategory,
  HarmSeverity,
  HarmBlockThreshold,
} from 'firebase/vertexai';

// Initialize the Vertex AI service
export const vertexAI = getVertexAI(firebaseApp);

// Initialize the generative model with a model that supports your use case
export const geminiModel = getGenerativeModel(vertexAI, {
  model: 'gemini-2.0-flash',
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

export async function askGemini(prompt: string) {
  // To generate text output, call generateContent with the text input
  console.info(`gemini query: ${prompt}`);
  const result = await geminiModel.generateContent(prompt);

  const response = result.response;
  const text = response.text();
  console.info(`gemini response: ${text}`);
  return text;
}
