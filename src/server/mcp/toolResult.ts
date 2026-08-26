import type { CallToolResult } from '@modelcontextprotocol/server';

/**
 * Antwortform der Tools.
 *
 * JSON als Text und nicht `structuredContent`: Ein Tool ohne `outputSchema`
 * darf zwar strukturiert antworten, aber nicht jeder Client wertet das aus —
 * und was kein Client liest, ist keine Antwort. Der Text bleibt für alle
 * gleich lesbar.
 */
export function jsonResult(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

/**
 * Ein fachlicher Fehler.
 *
 * `isError: true` statt einer geworfenen Ausnahme: Das Modell soll die
 * Meldung sehen und darauf reagieren können („du bist für diesen Einsatz
 * nicht berechtigt"), statt dass der Aufruf auf Protokollebene scheitert.
 */
export function errorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}
