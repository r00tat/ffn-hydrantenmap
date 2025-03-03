import { askGemini } from '../../components/firebase/vertexai';

export default async function firecallAIQuery(query: string, summary: string) {
  const response =
    await askGemini(`Der Nutzer stellt eine Frage zu einem Einsatz. Beantwortet die Frage kurz, prägnant und wahrheitsgetreut. Nachfolgend sind Infos zu dem Einsatz aufgelistet. 

    Frage: ${query}

    Informationen zum Einsatz:
    ${summary}
    `);
  return response;
}
