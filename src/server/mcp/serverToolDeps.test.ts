import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { addMock, updateMock } = vi.hoisted(() => ({
  addMock: vi.fn(async () => ({ id: 'neu-1' })),
  updateMock: vi.fn(async () => undefined),
}));
vi.mock('./writeOps', () => ({
  addMcpFirecallItem: addMock,
  updateMcpFirecallItem: updateMock,
}));
vi.mock('./clusterQuery', () => ({ queryClustersAdmin: vi.fn(async () => []) }));

const { createServerToolDeps, McpWriteForbiddenError } = await import(
  './serverToolDeps'
);

const write = {
  firecallId: 'call-1',
  user: 'uid-1',
  clientId: 'mcp_abc',
  clientName: 'Claude',
};

const items = [
  { id: 'i1', name: 'TLFA 4000', type: 'vehicle', fw: 'Neusiedl', lat: 47, lng: 16 },
  { id: 'i2', name: 'Marker', type: 'marker', lat: 47.1, lng: 16.1 },
];

function deps(overrides: Record<string, unknown> = {}) {
  return createServerToolDeps({
    write,
    existingItems: items as never,
    einsatzort: { lat: 47.95, lng: 16.84 },
    canWrite: true,
    ...overrides,
  });
}

describe('createServerToolDeps', () => {
  it('bildet keinen Kartenzustand ab', () => {
    const d = deps();
    expect(d.map).toBeNull();
    expect(d.lastCreatedItem).toBeNull();
  });

  it('löst auto auf den Einsatzort auf, weil es keinen Standort gibt', async () => {
    const origin = await deps().resolveOrigin({ type: 'auto' });
    expect(origin).toMatchObject({
      lat: 47.95,
      lng: 16.84,
      type: 'einsatzort',
    });
  });

  it('benennt den Rückfall, wenn kein Einsatzort gesetzt ist', async () => {
    const origin = await deps({ einsatzort: undefined }).resolveOrigin({
      type: 'auto',
    });
    expect(origin.label).toMatch(/kein Einsatzort gesetzt/);
  });

  it('findet ein Element über Name und Feuerwehr zusammen', async () => {
    const origin = await deps().resolveOrigin({
      type: 'atItem',
      itemName: 'TLFA Neusiedl',
    });
    expect(origin).toMatchObject({ lat: 47, lng: 16, type: 'atItem' });
  });

  it('nimmt Koordinaten unverändert', async () => {
    const origin = await deps().resolveOrigin({
      type: 'coordinates',
      lat: 1,
      lng: 2,
    });
    expect(origin).toMatchObject({ lat: 1, lng: 2, type: 'coordinates' });
  });

  it('reicht Schreibvorgänge mit Herkunft durch', async () => {
    const d = deps();
    await d.addFirecallItem({ type: 'marker', name: 'x' } as never);
    expect(addMock).toHaveBeenCalledWith(write, { type: 'marker', name: 'x' });
  });

  it('verweigert Schreiben ohne Schreibrecht', async () => {
    const d = deps({ canWrite: false });
    await expect(
      d.addFirecallItem({ type: 'marker', name: 'x' } as never),
    ).rejects.toThrow(McpWriteForbiddenError);
    await expect(
      d.updateFirecallItem({ id: 'i1', type: 'marker', name: 'x' } as never),
    ).rejects.toThrow(McpWriteForbiddenError);
  });

  it('reicht beim Ändern das vorherige Element für den Auditlog mit', async () => {
    const d = deps();
    await d.updateFirecallItem({
      id: 'i1',
      type: 'vehicle',
      name: 'TLFA 4000',
    } as never);
    expect(updateMock).toHaveBeenCalledWith(
      write,
      expect.objectContaining({ id: 'i1' }),
      expect.objectContaining({ id: 'i1', name: 'TLFA 4000' }),
    );
  });

  it('sammelt Leitungsvorschläge, statt sie zu zeichnen', () => {
    const d = deps();
    d.proposeHoseLineDrafts([{ id: 'd1' } as never]);
    expect(d.collectedDrafts).toHaveLength(1);
    d.proposeHoseLineDrafts([{ id: 'd2' } as never, { id: 'd3' } as never]);
    expect(d.collectedDrafts.map((draft) => (draft as { id: string }).id)).toEqual([
      'd2',
      'd3',
    ]);
  });
});
