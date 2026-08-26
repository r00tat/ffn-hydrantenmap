import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../firebase/admin', () => ({
  firestore: { collection: () => ({ doc: () => ({ get: vi.fn() }) }) },
}));

const { createMcpServerForAuth } = await import('./mcpServer');
import type { McpAuthContext } from './mcpUserRequired';
import type { McpScope } from '../../common/mcp/scopes';

const user = {
  uid: 'uid-1',
  isAdmin: false,
  groups: ['allUsers', 'ffnd'],
  fahrtenbuchGeraetemeister: [],
};

function auth(scopes: McpScope[]): McpAuthContext {
  return {
    user,
    scopes,
    clientId: 'mcp_abc',
    clientName: 'Claude',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    token: 'token',
  };
}

/** `toolInputSchemaJson` liefert `undefined`, wenn kein solches Tool registriert ist. */
function hasTool(scopes: McpScope[], name: string): boolean {
  return (
    createMcpServerForAuth(auth(scopes)).toolInputSchemaJson(name) !== undefined
  );
}

afterEach(() => {
  delete process.env.MCP_WRITE_ENABLED;
});

describe('createMcpServerForAuth', () => {
  it('registriert lesende Tools nur mit einsatz:read', () => {
    expect(hasTool(['einsatz:read'], 'list_einsaetze')).toBe(true);
    expect(hasTool(['berechnung'], 'list_einsaetze')).toBe(false);
    expect(hasTool(['berechnung'], 'get_einsatz_kontext')).toBe(false);
  });

  it('registriert die Wasserversorgungssuche nur mit hydranten:read', () => {
    expect(hasTool(['hydranten:read'], 'search_wasserversorgung')).toBe(true);
    expect(hasTool(['einsatz:read'], 'search_wasserversorgung')).toBe(false);
  });

  it('registriert Rechner-Tools nur mit berechnung', () => {
    expect(hasTool(['berechnung'], 'calc_loeschwasserfoerderung')).toBe(true);
    expect(hasTool(['berechnung'], 'strahlenschutz_abstand')).toBe(true);
    expect(hasTool(['einsatz:read'], 'calc_pendelverkehr')).toBe(false);
  });

  it('registriert schreibende Tools nur mit einsatz:write', () => {
    process.env.MCP_WRITE_ENABLED = 'true';
    expect(hasTool(['einsatz:write'], 'create_diary_entry')).toBe(true);
    expect(hasTool(['einsatz:read'], 'create_diary_entry')).toBe(false);
    expect(hasTool(['einsatz:read'], 'delete_item')).toBe(false);
  });

  it('registriert schreibende Tools nicht ohne MCP_WRITE_ENABLED', () => {
    process.env.MCP_WRITE_ENABLED = 'false';
    expect(hasTool(['einsatz:write'], 'create_diary_entry')).toBe(false);
    expect(hasTool(['einsatz:write'], 'create_item')).toBe(false);
  });

  it('registriert ohne jeden Scope kein einziges Tool', () => {
    const server = createMcpServerForAuth(auth([]));
    for (const name of [
      'list_einsaetze',
      'search_wasserversorgung',
      'calc_sandsackbedarf',
      'create_item',
    ]) {
      expect(server.toolInputSchemaJson(name)).toBeUndefined();
    }
  });
});
