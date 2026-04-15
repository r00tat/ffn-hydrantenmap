import { el, renderContent, showStatus } from './sybos-widget';
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

function showFirecall(content: HTMLElement, fc: Firecall): void {
  // Einsatz name
  const nameField = el('div', { className: 'ek-field' });
  nameField.appendChild(el('label', {}, 'Einsatz'));
  nameField.appendChild(el('strong', {}, fc.name || '\u2013'));
  content.appendChild(nameField);

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
    : '\u2013';
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
    'In Einsatzkarte \u00f6ffnen \u2197'
  );
  content.appendChild(link);

  // Page-specific sections (each renders only if its SYBOS page is detected)
  renderPersonnelSection(content);
  renderVehicleTableSection(content);
  renderMannschaftEditSection(content);
  renderVehicleListSection(content);
}

/** Load the current firecall from the service worker and render it. */
export async function loadFirecall(): Promise<void> {
  try {
    const authState = await chrome.runtime.sendMessage({
      type: 'GET_AUTH_STATE',
    });

    if (!authState.isLoggedIn) {
      showStatus('Nicht angemeldet. Bitte \u00fcber die Extension anmelden.');
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'GET_CURRENT_FIRECALL',
    });

    if (response.error) {
      showStatus(response.error);
      return;
    }

    if (!response.firecall) {
      showStatus('Kein aktiver Einsatz');
      return;
    }

    renderContent((content) => showFirecall(content, response.firecall));
  } catch (err) {
    showStatus('Fehler beim Laden');
    console.error('[EK] error loading firecall:', err);
  }
}
