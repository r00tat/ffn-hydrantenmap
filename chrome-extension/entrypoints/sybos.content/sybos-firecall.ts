import { el, renderContent, showStatus } from './sybos-widget';
import {
  renderFirecallSelect,
  type FirecallListEntry,
} from './sybos-firecall-select';
import { renderPersonnelSection } from './sybos-section-personnel';
import { renderVehicleTableSection } from './sybos-section-vehicle-table';
import { renderMannschaftEditSection } from './sybos-section-mannschaft-edit';
import { renderVehicleListSection } from './sybos-section-vehicle-list';

const EINSATZKARTE_URL = 'https://einsatz.ffnd.at';

interface Firecall {
  id: string;
  name?: string;
  description?: string;
  date?: string;
}

function showFirecall(
  content: HTMLElement,
  fc: Firecall,
  firecallList: FirecallListEntry[] | null,
): void {
  // Einsatz selector (or fallback to read-only name on list error)
  if (firecallList) {
    renderFirecallSelect(content, firecallList, fc.id, async (newId) => {
      if (newId === fc.id) return;
      await chrome.storage.local.set({ selectedFirecallId: newId });
      await loadFirecall();
    });
  } else {
    const nameField = el('div', { className: 'ek-field' });
    nameField.appendChild(el('label', {}, 'Einsatz'));
    nameField.appendChild(el('strong', {}, fc.name || '–'));
    content.appendChild(nameField);
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

    if (!fcResp.firecall) {
      showStatus('Kein aktiver Einsatz');
      return;
    }

    const firecallList: FirecallListEntry[] | null =
      listResp && !listResp.error && Array.isArray(listResp.firecalls)
        ? listResp.firecalls
        : null;

    renderContent((content) =>
      showFirecall(content, fcResp.firecall, firecallList),
    );
  } catch (err) {
    showStatus('Fehler beim Laden');
    console.error('[EK] error loading firecall:', err);
  }
}
