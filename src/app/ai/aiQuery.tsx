import { useCallback, useState } from 'react';
import {
  askGemini,
  geminiModel,
  useAiQueryHook,
} from '../../components/firebase/vertexai';
import useFirecallSummary from './firecallSummary';
import { marked } from 'marked';

function createPrompt(query: string, summary: string) {
  return `Der Nutzer stellt eine Frage zu einem Einsatz. Beantwortet die Frage kurz, prägnant und wahrheitsgetreut. Erläutere danach woher die Informationen stammen und liste diese auf. Nachfolgend sind Infos zu dem Einsatz aufgelistet. 

    Frage: ${query}

    Informationen zum Einsatz:
    ${summary}
    `;
}

export default async function firecallAIQuery(query: string, summary: string) {
  const response = await askGemini(createPrompt(query, summary));
  return response;
}

export function useFirecallAIQueryStream() {
  const summary = useFirecallSummary();
  const { query: aiQuery, ...rest } = useAiQueryHook();

  const query = useCallback(
    async (question: string) => {
      const prompt = createPrompt(question, summary);
      return await aiQuery(prompt);
    },
    [aiQuery, summary]
  );

  return { query, ...rest };
}
