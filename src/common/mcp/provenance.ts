/**
 * Herkunftsmarkierung maschinell erzeugter Einträge.
 *
 * Ein Tagebucheintrag, den ein Sprachmodell über MCP geschrieben hat, muss im
 * Einsatztagebuch als solcher erkennbar sein — er kann später Grundlage einer
 * Erhebung oder eines Berichts sein, und dann zählt, ob ihn ein Mensch
 * verfasst hat.
 *
 * Die Felder stehen am Element selbst und nicht nur im `auditlog`: Der
 * Auditlog ist die Prüfspur, das Element ist das, was jemand liest.
 */

/** Wert von `source` an Elementen, die über MCP entstanden sind. */
export const MCP_SOURCE = 'mcp';

export interface McpProvenance {
  /** `'mcp'` an allem, was über den MCP-Server entstanden ist. */
  source?: string;
  /** Die `client_id` der Anwendung, die geschrieben hat. */
  mcpClientId?: string;
  /** Anzeigename der Anwendung, damit die Oberfläche keinen Lookup braucht. */
  mcpClientName?: string;
}

export function isMcpItem(item: {
  source?: string;
}): boolean {
  return item?.source === MCP_SOURCE;
}

/** Kurzbezeichnung der schreibenden Anwendung für die Oberfläche. */
export function mcpClientLabel(item: {
  mcpClientName?: string;
  mcpClientId?: string;
}): string | undefined {
  return item.mcpClientName || item.mcpClientId;
}
