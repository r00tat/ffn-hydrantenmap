export function findMatchingVehicleOption(
  vehicleName: string,
  options: HTMLOptionElement[]
): HTMLOptionElement | null {
  const trimmed = vehicleName.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase();

  for (const option of options) {
    if (option.value === '0' || option.value === '') continue;

    const optionText = (option.textContent ?? '').trim().toLowerCase();

    // Match either the exact name, or the name followed by a space — SYBOS
    // suffixes some options with a parenthesized descriptor
    // ("KDTFA (Kommando …)") and others with a bare location
    // ("WLF-K Neusiedl am See"). A plain `+ ' ('` prefix would miss the
    // paren-less variant, so we key off the trailing space (which subsumes
    // the "(" case). Mirrors `matchesVehicleName` in sybos-multiselect.ts.
    if (optionText === normalized || optionText.startsWith(normalized + ' ')) {
      return option;
    }
  }

  return null;
}
