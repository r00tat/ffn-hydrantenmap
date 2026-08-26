import 'server-only';

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import {
  availableDocsSlugs,
  loadDocsContent,
} from '../../components/docs/loadDocsContent';

/**
 * Resources und Prompts.
 *
 * Die Benutzerdokumentation wird als MCP-Resource ausgeliefert: Damit
 * beantwortet ein Client Bedienfragen („wie lege ich eine Ebene an?") aus der
 * gepflegten Doku, ohne dass dafür etwas gebaut werden muss — und ohne dass
 * das Modell es sich ausdenkt.
 */

const DOCS_SCHEME = 'einsatzkarte';

export function registerDocsResources(server: McpServer): void {
  for (const slug of availableDocsSlugs()) {
    server.registerResource(
      `docs-${slug}`,
      `${DOCS_SCHEME}://docs/${slug}`,
      {
        title: `Dokumentation: ${slug}`,
        description: `Benutzerdokumentation der Einsatzkarte zum Thema "${slug}".`,
        mimeType: 'text/markdown',
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            // Deutsch: Die Dokumentation ist auf Deutsch gepflegt, die
            // englische Fassung fällt ohnehin auf sie zurück. Eine
            // Sprachwahl über die Resource-URI wäre eine zweite Wahrheit
            // ohne Nutzen — das Modell übersetzt selbst.
            text: await loadDocsContent(slug, 'de'),
          },
        ],
      }),
    );
  }
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'einsatz_zusammenfassung',
    {
      title: 'Einsatz-Zusammenfassung',
      description:
        'Erstellt eine sachliche Zusammenfassung eines Einsatzes aus Tagebuch, ' +
        'Einsatzmitteln und Lage — die Vorlage für den Einsatzbericht.',
      argsSchema: z.object({
        firecallId: z.string().describe('ID des Einsatzes'),
      }),
    },
    ({ firecallId }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Erstelle eine sachliche Zusammenfassung des Einsatzes ${firecallId}.`,
              '',
              'Gehe so vor:',
              `1. Rufe get_einsatz_kontext für ${firecallId} auf.`,
              `2. Rufe get_tagebuch für ${firecallId} auf.`,
              '3. Fasse zusammen: Alarmierung und Einsatzart, eingesetzte Kräfte und',
              '   Fahrzeuge, Verlauf in zeitlicher Reihenfolge, durchgeführte Maßnahmen,',
              '   Ende des Einsatzes.',
              '',
              'Regeln:',
              '- Nur Angaben verwenden, die in den Daten stehen. Nichts ergänzen und',
              '  nichts ausschmücken — der Text kann Grundlage eines Einsatzberichts sein.',
              '- Fehlt eine Angabe, benenne die Lücke, statt sie zu füllen.',
              '- Nüchterner Behördenton, keine Wertungen.',
              '- Personennamen nur nennen, wenn sie für den Verlauf nötig sind.',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'social_media_beitrag',
    {
      title: 'Social-Media-Beitrag',
      description:
        'Erstellt aus einem Einsatz einen Beitrag für die Öffentlichkeitsarbeit ' +
        '(Facebook/Instagram).',
      argsSchema: z.object({
        firecallId: z.string().describe('ID des Einsatzes'),
        plattform: z
          .string()
          .optional()
          .describe('Facebook, Instagram — beeinflusst Länge und Ton'),
      }),
    },
    ({ firecallId, plattform }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Erstelle einen Beitrag für ${plattform || 'Facebook'} über den Einsatz ${firecallId}.`,
              '',
              'Gehe so vor:',
              `1. Rufe get_einsatz_kontext für ${firecallId} auf.`,
              `2. Rufe get_tagebuch für ${firecallId} auf.`,
              '3. Schreibe den Beitrag.',
              '',
              'Regeln:',
              '- **Keine Personennamen, keine Kennzeichen, keine Adressen von',
              '  Betroffenen.** Nur die Straße oder der Ortsteil, wenn überhaupt.',
              '- Keine Angaben zu Verletzten über das hinaus, was ohnehin öffentlich ist.',
              '- Sachlich und wertschätzend gegenüber allen eingesetzten Kräften;',
              '  beteiligte Feuerwehren und Organisationen nennen.',
              '- Kurz halten, mit passenden Hashtags am Ende.',
              '- Nichts erfinden: Was nicht in den Daten steht, kommt nicht in den Text.',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
