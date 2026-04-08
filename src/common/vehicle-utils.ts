export function getEffectiveBesatzung(
  besatzung: string | undefined,
  crewCount: number
): number {
  const manual = besatzung ? Number.parseInt(besatzung, 10) : 0;
  if (manual > 0) return manual;
  if (crewCount > 0) return Math.max(crewCount - 1, 0);
  return 0;
}
