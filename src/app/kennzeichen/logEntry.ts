export type KennzeichenSystem = 'einsatz' | 'uebung';

export interface KennzeichenLogInput {
  user: string;
  groupId: string;
  system: KennzeichenSystem;
  platePrefix: string;
  plateNumber: string;
  resultCount: number;
  success: boolean;
  timestamp: string;
}

export interface KennzeichenLogEntry {
  user: string;
  groupId: string;
  system: KennzeichenSystem;
  plate: string;
  resultCount: number;
  success: boolean;
  timestamp: string;
}

/** Pure builder — assembles the log document from raw query parameters. */
export function buildKennzeichenLogEntry(
  input: KennzeichenLogInput
): KennzeichenLogEntry {
  const plate = `${input.platePrefix.trim().toUpperCase()} ${input.plateNumber
    .trim()
    .toUpperCase()}`.trim();
  return {
    user: input.user,
    groupId: input.groupId,
    system: input.system,
    plate,
    resultCount: input.resultCount,
    success: input.success,
    timestamp: input.timestamp,
  };
}
