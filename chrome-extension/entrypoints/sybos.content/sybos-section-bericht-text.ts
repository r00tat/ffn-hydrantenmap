import { el } from './sybos-widget';
import {
  applyBerichtText,
  hasSybosBerichtText,
  planBerichtText,
  type BerichtTextKey,
  type BerichtTexts,
} from './sybos-bericht-text';

const LABELS: Record<BerichtTextKey, string> = {
  einsatzablauf: 'Einsatzablauf',
  taetigkeit: 'Tätigkeit / Bemerkung',
};

/**
 * Append the „Einsatzbericht-Text" section: one button that fills SYBOS's
 * „Einsatzablauf" and „Tätigkeit / Bemerkung" with the texts from the
 * Sybos-Übertrag page of the Einsatzkarte. Renders only on the Einsatz form.
 *
 * The texts are filled into the open form, not saved — saving stays with
 * SYBOS's own button (see `sybos-bericht-text.ts`).
 */
export function renderBerichtTextSection(
  content: HTMLElement,
  texts: BerichtTexts
): void {
  if (!hasSybosBerichtText()) return;

  const section = el('div', { className: 'ek-crew-section' });
  section.appendChild(el('div', { className: 'ek-crew-title' }, 'Einsatzbericht-Text'));

  if (!texts.einsatzablauf.trim() && !texts.taetigkeit.trim()) {
    section.appendChild(
      el(
        'div',
        { className: 'ek-crew-result' },
        'Noch kein Text — in der Einsatzkarte unter „Sybos-Übertrag" erstellen.'
      )
    );
    content.appendChild(section);
    return;
  }

  const btn = el('button', { className: 'ek-crew-btn' }, 'Texte eintragen');
  const resultArea = el('div');
  section.appendChild(btn);
  section.appendChild(resultArea);
  content.appendChild(section);

  btn.addEventListener('click', () => {
    resultArea.replaceChildren();
    const plan = planBerichtText(document, texts);

    let keys = plan.write;
    if (plan.conflicts.length > 0) {
      const names = plan.conflicts.map((key) => `„${LABELS[key]}"`).join(' und ');
      const overwrite = window.confirm(
        `In SYBOS steht bei ${names} schon ein anderer Text. Überschreiben?`
      );
      if (!overwrite) keys = keys.filter((key) => !plan.conflicts.includes(key));
    }

    applyBerichtText(document, texts, keys);

    if (keys.length > 0) {
      resultArea.appendChild(
        el(
          'div',
          { className: 'ek-crew-result success' },
          `✓ ${keys.map((key) => LABELS[key]).join(', ')} eingetragen — bitte in SYBOS speichern`
        )
      );
    }
    const kept = plan.write.filter((key) => !keys.includes(key));
    if (kept.length > 0) {
      resultArea.appendChild(
        el(
          'div',
          { className: 'ek-crew-result warning' },
          `⚠ Nicht überschrieben: ${kept.map((key) => LABELS[key]).join(', ')}`
        )
      );
    }
    if (plan.write.length === 0) {
      resultArea.appendChild(
        el('div', { className: 'ek-crew-result' }, 'Texte stehen schon so in SYBOS')
      );
    }
  });
}
