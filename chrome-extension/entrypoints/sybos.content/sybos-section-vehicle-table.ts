import { el } from './sybos-widget';
import {
  hasSybosVehicleTable,
  parseSybosVehicleTable,
} from './sybos-vehicle-table';
import { findMatchingName } from './name-matching';
import { findMatchingVehicleOption } from './vehicle-matching';

interface VehicleAssignResult {
  assigned: string[];
  noVehicle: string[];
  notInEinsatz: string[];
}

/** Append the vehicle-assignment section if the SYBOS vehicle table is present. */
export function renderVehicleTableSection(content: HTMLElement): void {
  if (!hasSybosVehicleTable()) return;

  const section = el('div', { className: 'ek-crew-section' });
  section.appendChild(
    el('div', { className: 'ek-crew-title' }, 'Fahrzeugzuordnung')
  );

  const vehicleBtn = el(
    'button',
    { className: 'ek-crew-btn' },
    'Fahrzeuge zuweisen'
  );
  section.appendChild(vehicleBtn);

  const resultArea = el('div');
  section.appendChild(resultArea);
  content.appendChild(section);

  vehicleBtn.addEventListener('click', async () => {
    vehicleBtn.disabled = true;
    vehicleBtn.textContent = 'Weise zu...';

    try {
      const result = await matchAndAssignVehiclesInSybos();
      resultArea.replaceChildren();

      if (result.assigned.length > 0) {
        resultArea.appendChild(
          el(
            'div',
            { className: 'ek-crew-result success' },
            `\u2713 ${result.assigned.length} zugeordnet`
          )
        );
        for (const name of result.assigned) {
          resultArea.appendChild(
            el('div', { className: 'ek-crew-name' }, name)
          );
        }
      }

      if (result.noVehicle.length > 0) {
        resultArea.appendChild(
          el(
            'div',
            { className: 'ek-crew-result warning' },
            `\u26a0 ${result.noVehicle.length} ohne Fahrzeug in EK`
          )
        );
        for (const name of result.noVehicle) {
          resultArea.appendChild(
            el('div', { className: 'ek-crew-name' }, name)
          );
        }
      }

      if (result.notInEinsatz.length > 0) {
        resultArea.appendChild(
          el(
            'div',
            { className: 'ek-crew-result muted' },
            `\u2717 ${result.notInEinsatz.length} nicht im Einsatz`
          )
        );
        for (const name of result.notInEinsatz) {
          resultArea.appendChild(
            el('div', { className: 'ek-crew-name' }, name)
          );
        }
      }

      if (
        result.assigned.length === 0 &&
        result.noVehicle.length === 0 &&
        result.notInEinsatz.length === 0
      ) {
        resultArea.appendChild(
          el(
            'div',
            { className: 'ek-crew-result' },
            'Keine Zuordnung m\u00f6glich'
          )
        );
      }
    } catch (err) {
      console.error('[EK] error assigning vehicles:', err);
      resultArea.replaceChildren();
      resultArea.appendChild(
        el(
          'div',
          { className: 'ek-crew-result warning' },
          'Fehler beim Zuweisen'
        )
      );
    }

    vehicleBtn.textContent = 'Erneut zuweisen';
    vehicleBtn.disabled = false;
  });
}

async function matchAndAssignVehiclesInSybos(): Promise<VehicleAssignResult> {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_CREW_ASSIGNMENTS',
  });

  if (response.error || !response.assignments?.length) {
    return { assigned: [], noVehicle: [], notInEinsatz: [] };
  }

  const rows = parseSybosVehicleTable();
  const ekNames: string[] = response.assignments.map(
    (a: { name: string }) => a.name
  );

  const assigned: string[] = [];
  const noVehicle: string[] = [];
  const notInEinsatz: string[] = [];

  for (const row of rows) {
    const matchedEkName = findMatchingName(row.personName, ekNames);

    if (!matchedEkName) {
      notInEinsatz.push(row.personName);
      continue;
    }

    const assignment = response.assignments.find(
      (a: { name: string }) => a.name === matchedEkName
    );

    if (!assignment) {
      notInEinsatz.push(row.personName);
      continue;
    }

    // Assign funktion if set
    if (assignment.funktion) {
      const funktionOptions = Array.from(row.funktionSelect.options);
      const matchingOption = funktionOptions.find(
        (opt) => opt.text.trim() === assignment.funktion
      );
      if (matchingOption && row.funktionSelect.value !== matchingOption.value) {
        row.funktionSelect.value = matchingOption.value;
        row.funktionSelect.dispatchEvent(
          new Event('change', { bubbles: true })
        );
      }
    }

    // Assign vehicle if set
    if (assignment.vehicleName) {
      const matchingVehicleOption = findMatchingVehicleOption(
        assignment.vehicleName,
        Array.from(row.fahrzeugSelect.options)
      );
      if (
        matchingVehicleOption &&
        row.fahrzeugSelect.value !== matchingVehicleOption.value
      ) {
        row.fahrzeugSelect.value = matchingVehicleOption.value;
        row.fahrzeugSelect.dispatchEvent(
          new Event('change', { bubbles: true })
        );
      }
    } else {
      noVehicle.push(row.personName);
    }

    assigned.push(row.personName);
  }

  return { assigned, noVehicle, notInEinsatz };
}
