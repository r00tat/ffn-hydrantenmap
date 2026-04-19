import { el } from './sybos-widget';
import { hasSybosPersonTable, parseSybosPersonTable } from './sybos-table';
import { findMatchingName } from './name-matching';

interface MatchResult {
  matched: string[];
  notFound: string[];
}

/** Append the personnel-matching section if the SYBOS person table is present. */
export function renderPersonnelSection(content: HTMLElement): void {
  if (!hasSybosPersonTable()) return;

  const section = el('div', { className: 'ek-crew-section' });
  section.appendChild(el('div', { className: 'ek-crew-title' }, 'Personal'));

  const matchBtn = el(
    'button',
    { className: 'ek-crew-btn' },
    'Personal markieren'
  );
  section.appendChild(matchBtn);

  const resultArea = el('div');
  section.appendChild(resultArea);
  content.appendChild(section);

  matchBtn.addEventListener('click', async () => {
    matchBtn.disabled = true;
    matchBtn.textContent = 'Markiere...';

    try {
      const result = await matchAndCheckPersonnel();

      resultArea.replaceChildren();

      if (result.matched.length > 0) {
        resultArea.appendChild(
          el(
            'div',
            { className: 'ek-crew-result success' },
            `\u2713 ${result.matched.length} markiert`
          )
        );
        for (const name of result.matched) {
          resultArea.appendChild(
            el('div', { className: 'ek-crew-name' }, name)
          );
        }
      }

      if (result.notFound.length > 0) {
        resultArea.appendChild(
          el(
            'div',
            { className: 'ek-crew-result warning' },
            `\u2717 ${result.notFound.length} nicht gefunden`
          )
        );
        for (const name of result.notFound) {
          resultArea.appendChild(
            el('div', { className: 'ek-crew-name' }, name)
          );
        }
      }

      if (result.matched.length === 0 && result.notFound.length === 0) {
        resultArea.appendChild(
          el(
            'div',
            { className: 'ek-crew-result' },
            'Keine Besatzung im Einsatz'
          )
        );
      }
    } catch (err) {
      console.error('[EK] error checking personnel:', err);
      resultArea.replaceChildren();
      resultArea.appendChild(
        el(
          'div',
          { className: 'ek-crew-result warning' },
          'Fehler beim Markieren'
        )
      );
    }

    matchBtn.textContent = 'Erneut markieren';
    matchBtn.disabled = false;
  });
}

async function matchAndCheckPersonnel(): Promise<MatchResult> {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_CREW_ASSIGNMENTS',
  });

  if (response.error || !response.assignments?.length) {
    return { matched: [], notFound: [] };
  }

  const persons = parseSybosPersonTable();
  const sybosNames = persons.map((p) => p.name);
  const matched: string[] = [];
  const notFound: string[] = [];

  for (const assignment of response.assignments) {
    const name: string = assignment.name;
    const matchedSybosName = findMatchingName(name, sybosNames);

    if (matchedSybosName) {
      const person = persons.find((p) => p.name === matchedSybosName);
      if (person && !person.checkbox.checked) {
        person.checkbox.checked = true;
        // Dispatch change event so SYBOS JavaScript picks up the state change
        person.checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
      matched.push(name);
    } else {
      notFound.push(name);
    }
  }

  return { matched, notFound };
}
