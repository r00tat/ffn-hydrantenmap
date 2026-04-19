import { el } from './sybos-widget';
import {
  hasSybosMannschaftEditTable,
  parseSybosMannschaftEditTable,
} from './sybos-mannschaft-edit-table';
import { findMatchingName } from './name-matching';
import { findMatchingVehicleOption } from './vehicle-matching';

interface VehicleAssignResult {
  assigned: string[];
  noVehicle: string[];
  notInEinsatz: string[];
}

/**
 * Append the crew-edit section when on the SYBOS "Mannschaft editieren" page.
 * Structure differs from the initial assignment table: selects are named
 * ESADFahrzeugListe_<key> / ESADFunktionListe_<key> and names live in
 * ADR_<id> inputs with title/birthdate suffixes.
 */
export function renderMannschaftEditSection(content: HTMLElement): void {
  if (!hasSybosMannschaftEditTable()) return;

  const section = el('div', { className: 'ek-crew-section' });
  section.appendChild(
    el('div', { className: 'ek-crew-title' }, 'Mannschaft zuordnen')
  );

  const meBtn = el(
    'button',
    { className: 'ek-crew-btn' },
    'Fahrzeuge & Funktion zuweisen'
  );
  section.appendChild(meBtn);

  const resultArea = el('div');
  section.appendChild(resultArea);
  content.appendChild(section);

  meBtn.addEventListener('click', async () => {
    meBtn.disabled = true;
    meBtn.textContent = 'Weise zu...';

    try {
      const result = await matchAndAssignMannschaftEdit();
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
      console.error('[EK] error assigning mannschaft edit:', err);
      resultArea.replaceChildren();
      resultArea.appendChild(
        el(
          'div',
          { className: 'ek-crew-result warning' },
          'Fehler beim Zuweisen'
        )
      );
    }

    meBtn.textContent = 'Erneut zuweisen';
    meBtn.disabled = false;
  });
}

async function matchAndAssignMannschaftEdit(): Promise<VehicleAssignResult> {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_CREW_ASSIGNMENTS',
  });

  if (response.error || !response.assignments?.length) {
    return { assigned: [], noVehicle: [], notInEinsatz: [] };
  }

  const rows = parseSybosMannschaftEditTable();
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

    if (assignment.funktion) {
      const funktionOptions = Array.from(row.funktionSelect.options);
      const matchingOption = funktionOptions.find(
        (opt) => opt.text.trim() === assignment.funktion
      );
      if (
        matchingOption &&
        row.funktionSelect.value !== matchingOption.value
      ) {
        row.funktionSelect.value = matchingOption.value;
        row.funktionSelect.dispatchEvent(
          new Event('change', { bubbles: true })
        );
      }
    }

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
