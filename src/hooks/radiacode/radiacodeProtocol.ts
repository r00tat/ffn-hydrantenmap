export interface RealtimeRateEvent {
  dosisleistung: number;
  cps: number;
}

// TODO(Phase 2, Task 4): replace stub with real parser against fixture from cdump/radiacode.
export function parseRealtimeRateEvent(_bytes: Uint8Array): RealtimeRateEvent | null {
  return null;
}

// TODO(Phase 2, Task 5): replace with real command framer.
export function buildRealtimeRateRequest(): Uint8Array {
  return new Uint8Array();
}
