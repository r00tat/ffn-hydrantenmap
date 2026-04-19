/**
 * Normalize a name for comparison: lowercase, strip diacritics, collapse whitespace.
 */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Split a normalized name into word tokens, discarding punctuation-only
 * tokens like "ing." or single-letter initials.
 */
function tokenize(name: string): string[] {
  return name
    .split(/[\s.,]+/)
    .map((w) => w.replace(/[.,]+$/, ''))
    .filter((w) => w.length >= 2);
}

/**
 * Find the best matching SYBOS name for a given Einsatzkarte name.
 * Returns the original (un-normalized) SYBOS name, or null if no match.
 *
 * Matching strategy:
 * 1. Exact match (after normalization)
 * 2. Reversed name order ("Vorname Nachname" <-> "Nachname Vorname")
 * 3. Substring containment (for multi-part names)
 * 4. Word-subset match: every token of the EK name appears in the SYBOS
 *    name (handles title prefixes like "Ing." and title suffixes like "MSc").
 */
export function findMatchingName(
  ekName: string,
  sybosNames: string[]
): string | null {
  const normalizedEk = normalizeName(ekName);

  // Build lookup map: normalized -> original
  const nameMap = new Map<string, string>();
  for (const sybosName of sybosNames) {
    nameMap.set(normalizeName(sybosName), sybosName);
  }

  // 1. Exact match
  const exact = nameMap.get(normalizedEk);
  if (exact) return exact;

  // 2. Reversed name order
  const parts = normalizedEk.split(' ');
  if (parts.length >= 2) {
    const reversed = [...parts].reverse().join(' ');
    const revMatch = nameMap.get(reversed);
    if (revMatch) return revMatch;
  }

  // 3. Substring containment
  for (const [normalizedSybos, original] of nameMap) {
    if (
      normalizedSybos.includes(normalizedEk) ||
      normalizedEk.includes(normalizedSybos)
    ) {
      return original;
    }
  }

  // 4. Word-subset match — require at least two EK tokens so we don't
  // accidentally match on a single shared surname across different people.
  const ekTokens = tokenize(normalizedEk);
  if (ekTokens.length >= 2) {
    for (const [normalizedSybos, original] of nameMap) {
      const sybosTokens = new Set(tokenize(normalizedSybos));
      if (ekTokens.every((t) => sybosTokens.has(t))) {
        return original;
      }
    }
  }

  return null;
}
