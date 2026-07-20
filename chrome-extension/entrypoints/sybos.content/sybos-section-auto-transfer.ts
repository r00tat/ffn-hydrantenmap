import { el } from './sybos-widget';
import {
  orchestratePersonal,
  orchestrateMaterial,
  type OrchestrateResult,
} from './sybos-orchestrate';
import { findEinsatzId } from './sybos-post';
import { hasSybosPersonTable } from './sybos-table';
import { hasSybosVehicleList } from './sybos-vehicle-list';
import { hasSybosVehicleTable } from './sybos-vehicle-table';
import { hasSybosMannschaftEditTable } from './sybos-mannschaft-edit-table';

type TransferKind = 'personal' | 'material';

/**
 * Append the "Automatisch übernehmen" section with the two one-click
 * transfer buttons (Personal / Material). Renders only on the plain SYBOS
 * Einsatz detail page — i.e. when we know the Einsatz id but none of the
 * interactive selection/edit pages (which already render their own
 * section) are currently shown.
 */
export function renderAutoTransferSection(content: HTMLElement): void {
  if (!findEinsatzId()) return;
  if (
    hasSybosPersonTable() ||
    hasSybosVehicleList() ||
    hasSybosVehicleTable() ||
    hasSybosMannschaftEditTable()
  ) {
    return;
  }

  const section = el('div', { className: 'ek-crew-section' });
  section.appendChild(
    el('div', { className: 'ek-crew-title' }, 'Automatisch übernehmen')
  );

  const personalBtn = el(
    'button',
    { className: 'ek-crew-btn' },
    'Personal übernehmen'
  );
  const personalResult = el('div');
  section.appendChild(personalBtn);
  section.appendChild(personalResult);

  const materialBtn = el(
    'button',
    { className: 'ek-crew-btn' },
    'Material übernehmen'
  );
  const materialResult = el('div');
  section.appendChild(materialBtn);
  section.appendChild(materialResult);

  content.appendChild(section);

  personalBtn.addEventListener('click', () =>
    runTransfer(personalBtn, personalResult, orchestratePersonal, 'personal')
  );
  materialBtn.addEventListener('click', () =>
    runTransfer(materialBtn, materialResult, orchestrateMaterial, 'material')
  );
}

async function runTransfer(
  btn: HTMLButtonElement,
  resultArea: HTMLElement,
  orchestrate: () => Promise<OrchestrateResult>,
  kind: TransferKind
): Promise<void> {
  btn.disabled = true;
  btn.textContent = 'Übertrage...';

  try {
    const result = await orchestrate();
    renderResult(resultArea, result, kind);
  } catch (err) {
    console.error('[EK] error transferring to SYBOS:', err);
    resultArea.replaceChildren();
    resultArea.appendChild(
      el(
        'div',
        { className: 'ek-crew-result warning' },
        'Fehler bei der Übertragung'
      )
    );
  }

  btn.textContent = 'Erneut übernehmen';
  btn.disabled = false;
}

function renderResult(
  resultArea: HTMLElement,
  result: OrchestrateResult,
  kind: TransferKind
): void {
  resultArea.replaceChildren();

  if (result.error) {
    resultArea.appendChild(
      el(
        'div',
        { className: 'ek-crew-result warning' },
        `✗ ${result.error}`
      )
    );
    return;
  }

  if (kind === 'personal') {
    renderPersonalResult(resultArea, result);
  } else {
    renderMaterialResult(resultArea, result);
  }
}

function appendNames(resultArea: HTMLElement, names: string[]): void {
  for (const name of names) {
    resultArea.appendChild(el('div', { className: 'ek-crew-name' }, name));
  }
}

function renderPersonalResult(
  resultArea: HTMLElement,
  result: OrchestrateResult
): void {
  if (result.matched.length > 0) {
    resultArea.appendChild(
      el(
        'div',
        { className: 'ek-crew-result success' },
        `✓ ${result.matched.length} ausgewählt`
      )
    );
    appendNames(resultArea, result.matched);
  }

  if (result.assigned.length > 0) {
    resultArea.appendChild(
      el(
        'div',
        { className: 'ek-crew-result success' },
        `✓ ${result.assigned.length} zugeordnet`
      )
    );
    appendNames(resultArea, result.assigned);
  }

  if (result.notFound.length > 0) {
    resultArea.appendChild(
      el(
        'div',
        { className: 'ek-crew-result warning' },
        `⚠ ${result.notFound.length} nicht gefunden`
      )
    );
    appendNames(resultArea, result.notFound);
  }

  if (result.noVehicle.length > 0) {
    resultArea.appendChild(
      el(
        'div',
        { className: 'ek-crew-result warning' },
        `⚠ ${result.noVehicle.length} ohne Fahrzeug`
      )
    );
    appendNames(resultArea, result.noVehicle);
  }

  if (
    result.matched.length === 0 &&
    result.assigned.length === 0 &&
    result.notFound.length === 0 &&
    result.noVehicle.length === 0
  ) {
    resultArea.appendChild(
      el(
        'div',
        { className: 'ek-crew-result' },
        'Keine Mannschaft übernommen'
      )
    );
  }
}

function renderMaterialResult(
  resultArea: HTMLElement,
  result: OrchestrateResult
): void {
  if (result.matched.length > 0) {
    resultArea.appendChild(
      el(
        'div',
        { className: 'ek-crew-result success' },
        `✓ ${result.matched.length} übernommen`
      )
    );
    appendNames(resultArea, result.matched);
  }

  if (result.notFound.length > 0) {
    resultArea.appendChild(
      el(
        'div',
        { className: 'ek-crew-result warning' },
        `⚠ ${result.notFound.length} nicht gefunden`
      )
    );
    appendNames(resultArea, result.notFound);
  }

  if (result.matched.length === 0 && result.notFound.length === 0) {
    resultArea.appendChild(
      el(
        'div',
        { className: 'ek-crew-result' },
        'Kein Material übernommen'
      )
    );
  }
}
