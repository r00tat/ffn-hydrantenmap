import { useCallback } from 'react';
import { askGemini, useAiQueryHook } from '../../components/firebase/vertexai';
import useFirecallSummary from './firecallSummary';

function createPrompt(
  query: string,
  summary: string,
  systemInstruction?: string
) {
  return `Der Nutzer stellt eine Frage zu einem Einsatz. ${
    systemInstruction
      ? ''
      : ' Beantwortet die Frage kurz, prägnant und wahrheitsgetreut. Erläutere danach woher die Informationen stammen und liste diese auf. Nachfolgend sind Informationen zu dem Einsatz aufgelistet.'
  } 

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
    async (question: string, systemInstruction?: string) => {
      const prompt = createPrompt(question, summary, systemInstruction);
      return await aiQuery(prompt, systemInstruction);
    },
    [aiQuery, summary]
  );

  return { query, ...rest };
}
