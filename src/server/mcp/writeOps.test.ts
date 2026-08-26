import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { addItem, addAudit, setDoc } = vi.hoisted(() => ({
  addItem: vi.fn(async (_data: Record<string, unknown>) => ({ id: 'neu-1' })),
  addAudit: vi.fn(async (_data: Record<string, unknown>) => ({ id: 'log-1' })),
  setDoc: vi.fn(
    async (_data: Record<string, unknown>, _options: { merge: boolean }) =>
      undefined,
  ),
}));

vi.mock('../firebase/admin', () => ({
  firestore: {
    collection: () => ({
      doc: () => ({
        collection: (name: string) =>
          name === 'auditlog'
            ? { add: addAudit }
            : { add: addItem, doc: () => ({ set: setDoc }) },
      }),
    }),
  },
}));

const { addMcpFirecallItem, updateMcpFirecallItem } = await import('./writeOps');

const context = {
  firecallId: 'call-1',
  user: 'uid-1',
  clientId: 'mcp_abc',
  clientName: 'Claude',
};

beforeEach(() => {
  addItem.mockClear();
  addAudit.mockClear();
  setDoc.mockClear();
});

describe('addMcpFirecallItem', () => {
  it('markiert das Element als über MCP entstanden', async () => {
    await addMcpFirecallItem(context, {
      type: 'diary',
      name: 'Eintrag',
      beschreibung: 'Text',
    } as never);

    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'mcp',
        mcpClientId: 'mcp_abc',
        mcpClientName: 'Claude',
        creator: 'uid-1',
        updatedBy: 'uid-1',
      }),
    );
  });

  it('entfernt leere Felder', async () => {
    await addMcpFirecallItem(context, {
      type: 'marker',
      name: 'x',
      beschreibung: '',
      art: undefined,
    } as never);
    const written = addItem.mock.calls[0][0];
    expect(written).not.toHaveProperty('beschreibung');
    expect(written).not.toHaveProperty('art');
  });

  it('schreibt einen Auditlog-Eintrag mit Benutzer und Anwendung', async () => {
    await addMcpFirecallItem(context, {
      type: 'marker',
      name: 'Einsatzstelle',
    } as never);

    expect(addAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        elementType: 'marker',
        elementName: 'Einsatzstelle',
        elementId: 'neu-1',
        user: 'uid-1 (MCP: Claude)',
      }),
    );
  });

  it('nennt im Auditlog die Client-ID, wenn kein Name bekannt ist', async () => {
    await addMcpFirecallItem(
      { ...context, clientName: undefined },
      { type: 'marker', name: 'x' } as never,
    );
    expect(addAudit).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'uid-1 (MCP: mcp_abc)' }),
    );
  });
});

describe('updateMcpFirecallItem', () => {
  it('schreibt mit merge und markiert die Herkunft', async () => {
    await updateMcpFirecallItem(context, {
      id: 'i1',
      type: 'marker',
      name: 'neu',
    } as never);

    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'mcp',
        mcpClientId: 'mcp_abc',
        updatedBy: 'uid-1',
        name: 'neu',
      }),
      { merge: true },
    );
    // Die ID gehört in den Dokumentpfad, nicht in das Dokument.
    expect(setDoc.mock.calls[0][0]).not.toHaveProperty('id');
  });

  it('protokolliert ein Soft-Delete als delete', async () => {
    await updateMcpFirecallItem(context, {
      id: 'i1',
      type: 'marker',
      name: 'x',
      deleted: true,
    } as never);
    expect(addAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete', elementId: 'i1' }),
    );
  });

  it('verweigert ein Update ohne ID', async () => {
    await expect(
      updateMcpFirecallItem(context, { type: 'marker', name: 'x' } as never),
    ).rejects.toThrow(/without id/);
  });
});
