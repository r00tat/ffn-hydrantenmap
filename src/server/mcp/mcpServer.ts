import 'server-only';

import { McpServer } from '@modelcontextprotocol/server';
import { hasScopes } from '../../common/mcp/scopes';
import type { McpAuthContext } from './mcpUserRequired';
import { registerCalculationTools } from './calcTools';
import { registerDocsResources, registerPrompts } from './resources';
import { registerReadTools, registerWaterSupplyTools } from './readTools';
import { mcpWriteEnabled, registerWriteTools } from './writeTools';

/**
 * Baut den MCP-Server für einen geprüften Zugriff.
 *
 * **Je Anfrage eine Instanz.** Der Transport ist zustandslos (die
 * Spec-Revision 2026-07-28 hat `Mcp-Session-Id` abgeschafft), und `createMcpHandler`
 * ruft die Factory für jede Anfrage neu auf. Das passt zum Betrieb auf Cloud
 * Run mit mehreren Instanzen ohne Sticky Sessions — ein Session-Store wäre
 * neue Infrastruktur ohne Gegenwert.
 *
 * **Registriert wird nur, was der Scope deckt.** Ein Token ohne
 * `einsatz:write` sieht die schreibenden Tools gar nicht erst in `tools/list`.
 * Das ist ehrlicher als ein Tool, das bei jedem Aufruf „nicht erlaubt" sagt,
 * und es hält den Werkzeugkasten des Modells klein.
 */
export function createMcpServerForAuth(auth: McpAuthContext): McpServer {
  const server = new McpServer(
    {
      name: 'einsatzkarte-ffn',
      version: '1.0.0',
      title: 'Einsatzkarte FF Neusiedl am See',
    },
    {
      instructions: [
        'Diese Schnittstelle gibt Zugriff auf die Einsatzkarte der Freiwilligen',
        'Feuerwehr Neusiedl am See.',
        '',
        'Beginne bei einer Frage zu einem Einsatz mit `list_einsaetze` und danach',
        '`get_einsatz_kontext` — der Gesamtkontext ersetzt mehrere Einzelaufrufe.',
        '',
        'Die Daten sind einsatzkritisch. Erfinde nichts: Fehlt eine Angabe, sage das,',
        'statt sie zu ergänzen. Rechnerische Fragen (Löschwasserförderung,',
        'Pendelverkehr, Sandsackbedarf, Strahlenschutz) gehören in die `calc_*`- und',
        '`strahlenschutz_*`-Tools und nicht in eine eigene Überschlagsrechnung —',
        'dort stecken die geprüften Tabellenwerte der Lehrunterlagen.',
      ].join('\n'),
    },
  );

  if (hasScopes(auth.scopes, ['einsatz:read'])) {
    registerReadTools(server, auth.user);
  }

  if (hasScopes(auth.scopes, ['hydranten:read'])) {
    registerWaterSupplyTools(server, auth.user);
  }

  if (hasScopes(auth.scopes, ['berechnung'])) {
    registerCalculationTools(server);
  }

  if (hasScopes(auth.scopes, ['einsatz:write']) && mcpWriteEnabled()) {
    registerWriteTools(server, {
      user: auth.user,
      clientId: auth.clientId,
      clientName: auth.clientName,
    });
  }

  // Dokumentation und Prompts hängen an keinem Scope: Sie enthalten keine
  // Einsatzdaten, sondern die öffentlich zugängliche Bedienungsanleitung.
  registerDocsResources(server);
  registerPrompts(server);

  return server;
}
