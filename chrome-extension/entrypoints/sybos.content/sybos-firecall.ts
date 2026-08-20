import { el, renderContent, showStatus } from './sybos-widget';
import {
  renderFirecallSelect,
  type FirecallListEntry,
} from './sybos-firecall-select';
import { renderAutoTransferSection } from './sybos-section-auto-transfer';
import { renderPersonnelSection } from './sybos-section-personnel';
import { renderVehicleTableSection } from './sybos-section-vehicle-table';
import { renderMannschaftEditSection } from './sybos-section-mannschaft-edit';
import { renderVehicleListSection } from './sybos-section-vehicle-list';
import { renderFirecallMatchSection } from './sybos-section-firecall-match';
import { readSybosEinsatzContext } from './sybos-einsatz-context';
import {
  evaluateFirecallSelection,
  type FirecallMatchEvaluation,
} from './firecall-matching';

const EINSATZKARTE_URL = 'https://einsatz.ffnd.at';

const NO_MATCH: FirecallMatchEvaluation = {
  verdict: 'unknown',
  best: null,
  selected: null,
};

interface Firecall {
  id: string;
  name?: string;
  description?: string;
  date?: string;
}

/** Store the selection and re-render everything from it. */
async function selectFirecall(id: string): Promise<void> {
  await chrome.storage.local.set({ selectedFirecallId: id });
  await loadFirecall();
}

function showFirecall(
  content: HTMLElement,
  fc: Firecall | null,
  firecallList: FirecallListEntry[] | null,
  matchEvaluation: FirecallMatchEvaluation,
): void {
  // Einsatz selector (or fallback to read-only name on list error)
  if (firecallList) {
    renderFirecallSelect(content, firecallList, fc?.id ?? null, async (newId) => {
      if (newId === fc?.id) return;
      await selectFirecall(newId);
    });
  } else {
    const nameField = el('div', { className: 'ek-field' });
    nameField.appendChild(el('label', {}, 'Einsatz'));
    nameField.appendChild(el('strong', {}, fc?.name || '–'));
    content.appendChild(nameField);
  }

  // Verdict on the selection, directly under the selector and above every
  // transfer button — a wrong Einsatz has to be seen before, not after.
  renderFirecallMatchSection(content, matchEvaluation, (id) => {
    void selectFirecall(id);
  });

  // Without a selected Einsatz there is nothing to show or transfer; the
  // selector and the suggestion above are the way out of that state.
  if (!fc) {
    content.appendChild(
      el('div', { className: 'ek-status' }, 'Kein aktiver Einsatz'),
    );
    return;
  }

  // Description (optional)
  if (fc.description) {
    const descField = el('div', { className: 'ek-field' });
    descField.appendChild(el('label', {}, 'Beschreibung'));
    descField.appendChild(document.createTextNode(fc.description));
    content.appendChild(descField);
  }

  // Date
  const dateField = el('div', { className: 'ek-field' });
  dateField.appendChild(el('label', {}, 'Datum'));
  const dateText = fc.date
    ? new Date(fc.date).toLocaleString('de-AT')
    : '–';
  dateField.appendChild(document.createTextNode(dateText));
  content.appendChild(dateField);

  // Link to Einsatzkarte
  const link = el(
    'a',
    {
      className: 'ek-link',
      href: `${EINSATZKARTE_URL}/einsatz/${fc.id}/details`,
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    'In Einsatzkarte öffnen ↗'
  );
  content.appendChild(link);

  // Page-specific sections (each renders only if its SYBOS page is detected)
  renderAutoTransferSection(content);
  renderPersonnelSection(content);
  renderVehicleTableSection(content);
  renderMannschaftEditSection(content);
  renderVehicleListSection(content);
}

/** Load the current firecall + list from the service worker and render. */
export async function loadFirecall(): Promise<void> {
  try {
    const authState = await chrome.runtime.sendMessage({
      type: 'GET_AUTH_STATE',
    });

    if (!authState.isLoggedIn) {
      showStatus('Nicht angemeldet. Bitte über die Extension anmelden.');
      return;
    }

    const [listResp, fcResp] = await Promise.all([
      chrome.runtime
        .sendMessage({ type: 'GET_FIRECALL_LIST' })
        .catch(() => ({ error: 'list-failed' })),
      chrome.runtime.sendMessage({ type: 'GET_CURRENT_FIRECALL' }),
    ]);

    if (fcResp.error) {
      showStatus(fcResp.error);
      return;
    }

    const firecallList: FirecallListEntry[] | null =
      listResp && !listResp.error && Array.isArray(listResp.firecalls)
        ? listResp.firecalls
        : null;

    const firecall: Firecall | null = fcResp.firecall ?? null;

    if (!firecall && !firecallList) {
      showStatus('Kein aktiver Einsatz');
      return;
    }

    // Read the SYBOS page before the panel is re-rendered, so the scrape sees
    // the page's own form fields and nothing of our own markup.
    const matchEvaluation = firecallList
      ? evaluateFirecallSelection(
          readSybosEinsatzContext(),
          firecallList,
          firecall?.id ?? null,
        )
      : NO_MATCH;

    renderContent((content) =>
      showFirecall(content, firecall, firecallList, matchEvaluation),
    );
  } catch (err) {
    showStatus('Fehler beim Laden');
    console.error('[EK] error loading firecall:', err);
  }
}
