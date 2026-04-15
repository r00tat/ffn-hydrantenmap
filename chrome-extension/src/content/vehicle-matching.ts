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

    if (
      optionText === normalized ||
      optionText.startsWith(normalized + ' (')
    ) {
      return option;
    }
  }

  return null;
}
