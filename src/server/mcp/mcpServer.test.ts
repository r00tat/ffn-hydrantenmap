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
  groupRoles: { ffnd: [] },
};

function auth(scopes: McpScope[], isAdmin = false): McpAuthContext {
  return {
    user: { ...user, isAdmin },
    scopes,
    clientId: 'mcp_abc',
    clientName: 'Claude',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    token: 'token',
  };
}

/** `toolInputSchemaJson` liefert `undefined`, wenn kein solches Tool registriert ist. */
function hasTool(scopes: McpScope[], name: string, isAdmin = false): boolean {
  return (
    createMcpServerForAuth(auth(scopes, isAdmin)).toolInputSchemaJson(name) !==
    undefined
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
    expect(hasTool(['einsatz:write'], 'edit_layer')).toBe(true);
    expect(hasTool(['einsatz:read'], 'edit_layer')).toBe(false);
  });

  it('registriert schreibende Tools nicht ohne MCP_WRITE_ENABLED', () => {
    process.env.MCP_WRITE_ENABLED = 'false';
    expect(hasTool(['einsatz:write'], 'create_diary_entry')).toBe(false);
    expect(hasTool(['einsatz:write'], 'create_item')).toBe(false);
  });

  it('registriert lesende Bug-Report-Tools nur mit bugreport:read', () => {
    expect(hasTool(['bugreport:read'], 'list_bug_reports')).toBe(true);
    expect(hasTool(['bugreport:read'], 'get_bug_report')).toBe(true);
    expect(hasTool(['einsatz:read'], 'list_bug_reports')).toBe(false);
    expect(hasTool(['bugreport:write'], 'get_bug_report', true)).toBe(false);
  });

  it('registriert schreibende Bug-Report-Tools nur für Admins mit bugreport:write', () => {
    expect(hasTool(['bugreport:write'], 'update_bug_report', true)).toBe(true);
    expect(hasTool(['bugreport:write'], 'add_bug_report_comment', true)).toBe(
      true,
    );
    // Ohne Adminflag hilft auch der Scope nicht.
    expect(hasTool(['bugreport:write'], 'update_bug_report')).toBe(false);
    expect(hasTool(['bugreport:write'], 'add_bug_report_comment')).toBe(false);
    // Und ohne Scope hilft das Adminflag nicht.
    expect(hasTool(['bugreport:read', 'einsatz:write'], 'update_bug_report', true)).toBe(
      false,
    );
  });

  it('registriert Bug-Report-Schreibtools unabhängig von MCP_WRITE_ENABLED', () => {
    process.env.MCP_WRITE_ENABLED = 'false';
    expect(hasTool(['bugreport:write'], 'update_bug_report', true)).toBe(true);
  });

  it('registriert ohne jeden Scope kein einziges Tool', () => {
    const server = createMcpServerForAuth(auth([]));
    for (const name of [
      'list_einsaetze',
      'search_wasserversorgung',
      'calc_sandsackbedarf',
      'create_item',
      'list_bug_reports',
      'update_bug_report',
    ]) {
      expect(server.toolInputSchemaJson(name)).toBeUndefined();
    }
  });
});
