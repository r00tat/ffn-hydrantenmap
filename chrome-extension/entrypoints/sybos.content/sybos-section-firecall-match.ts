import { el } from './sybos-widget';
import type { FirecallMatch, FirecallMatchEvaluation } from './firecall-matching';

/**
 * The panel's verdict on whether the selected Einsatz belongs to the SYBOS
 * page in front of the user — rendered directly under the Einsatz selector,
 * above the transfer buttons, so it is read before anything is written to
 * SYBOS.
 *
 * The transfer is deliberately never blocked: there are cases where the
 * assignment is meant to differ (a follow-up Einsatz reported under an
 * existing SYBOS Einsatzbericht). The warning has to be impossible to miss,
 * not impossible to overrule.
 */
export function renderFirecallMatchSection(
  container: HTMLElement,
  evaluation: FirecallMatchEvaluation,
  onSwitch: (firecallId: string) => void,
): void {
  const { verdict, best, selected } = evaluation;

  // 'unknown': no readable SYBOS data — behave exactly as before.
  // 'ok': plausible selection, nothing worth saying.
  if (verdict === 'unknown' || verdict === 'ok') return;

  if (verdict === 'confirmed') {
    container.appendChild(
      el(
        'div',
        { className: 'ek-match confirmed' },
        '✓ Passt zum SYBOS-Einsatz',
      ),
    );
    return;
  }

  if (verdict === 'unclear') {
    container.appendChild(
      el(
        'div',
        { className: 'ek-match muted' },
        'Keine Zuordnung zum SYBOS-Einsatz möglich — bitte selbst prüfen.',
      ),
    );
    return;
  }

  if (!best) return;

  const section = el('div', { className: 'ek-match ek-match-warning' });
  section.appendChild(
    el(
      'div',
      { className: 'ek-match-title' },
      selected
        ? '⚠ Ausgewählter Einsatz passt nicht zum SYBOS-Einsatz'
        : '⚠ Kein Einsatz ausgewählt',
    ),
  );

  for (const mismatch of selected?.mismatches ?? []) {
    section.appendChild(
      el(
        'div',
        { className: 'ek-match-reason' },
        `${mismatch.label}: ${mismatch.detail}`,
      ),
    );
  }

  section.appendChild(
    el('div', { className: 'ek-match-suggestion' }, describe(best)),
  );

  const button = el(
    'button',
    { className: 'ek-crew-btn' },
    'Zu diesem Einsatz wechseln',
  );
  button.addEventListener('click', () => onSwitch(best.firecall.id));
  section.appendChild(button);

  container.appendChild(section);
}

/** "Vorschlag: <Name> — <Datum>" for the suggested Einsatz. */
function describe(match: FirecallMatch): string {
  const { name, date } = match.firecall;
  const dateText = date ? new Date(date).toLocaleString('de-AT') : '–';
  return `Vorschlag: ${name || '–'} — ${dateText}`;
}
