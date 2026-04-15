import { el } from './sybos-widget';
import {
  hasSybosVehicleList,
  parseSybosVehicleList,
} from './sybos-vehicle-list';
import { findMatchingVehicleListRow } from './vehicle-list-matching';

interface VehicleListCheckResult {
  matched: string[];
  notFound: string[];
}

/** Append the vehicle-list section on the SYBOS vehicle-selection page. */
export function renderVehicleListSection(content: HTMLElement): void {
  if (!hasSybosVehicleList()) return;

  const section = el('div', { className: 'ek-crew-section' });
  section.appendChild(
    el('div', { className: 'ek-crew-title' }, 'Fahrzeuge markieren')
  );

  const vlBtn = el(
    'button',
    { className: 'ek-crew-btn' },
    'Fahrzeuge markieren'
  );
  section.appendChild(vlBtn);

  const resultArea = el('div');
  section.appendChild(resultArea);
  content.appendChild(section);

  vlBtn.addEventListener('click', async () => {
    vlBtn.disabled = true;
    vlBtn.textContent = 'Markiere...';

    try {
      const result = await matchAndCheckVehicleList();
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
            'Keine Fahrzeuge im Einsatz'
          )
        );
      }
    } catch (err) {
      console.error('[EK] error marking vehicle list:', err);
      resultArea.replaceChildren();
      resultArea.appendChild(
        el(
          'div',
          { className: 'ek-crew-result warning' },
          'Fehler beim Markieren'
        )
      );
    }

    vlBtn.textContent = 'Erneut markieren';
    vlBtn.disabled = false;
  });
}

async function matchAndCheckVehicleList(): Promise<VehicleListCheckResult> {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_FIRECALL_VEHICLES',
  });

  if (response.error || !response.vehicles?.length) {
    return { matched: [], notFound: [] };
  }

  const rows = parseSybosVehicleList();
  const matched: string[] = [];
  const notFound: string[] = [];

  for (const vehicle of response.vehicles as Array<{
    id: string;
    name: string;
  }>) {
    const row = findMatchingVehicleListRow(vehicle.name, rows);
    if (row) {
      if (!row.checkbox.checked) {
        row.checkbox.checked = true;
        row.checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
      matched.push(vehicle.name);
    } else {
      notFound.push(vehicle.name);
    }
  }

  return { matched, notFound };
}
