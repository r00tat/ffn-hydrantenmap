import { el } from './sybos-widget';
import {
  orchestratePersonal,
  orchestrateMaterial,
  type OrchestrateResult,
} from './sybos-orchestrate';
import { findEinsatzId, reloadUrlForEinsatz } from './sybos-post';
import { hasSybosPersonTable } from './sybos-table';
import { hasSybosVehicleList } from './sybos-vehicle-list';
import { hasSybosVehicleTable } from './sybos-vehicle-table';
import { hasSybosMannschaftEditTable } from './sybos-mannschaft-edit-table';

type TransferKind = 'personal' | 'material';

/** Delay before auto-reloading, so the result summary is briefly visible. */
const RELOAD_DELAY_MS = 1800;

/**
 * Append the "Automatisch übernehmen" section with the one-click transfer
 * buttons. Renders only on the plain SYBOS Einsatz detail page — i.e. when we
 * know the Einsatz id but none of the interactive selection/edit pages (which
 * already render their own section) are currently shown.
 *
 * Button order matters: Material must run before Mannschaft, because a person
 * can only be assigned to a vehicle that already exists in the Einsatz. The
 * combined button enforces that order in a single click.
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

  // Primary: both steps in the correct order (Material first, then Mannschaft).
  const combinedBtn = el(
    'button',
    { className: 'ek-crew-btn' },
    'Material & Mannschaft übernehmen'
  );
  const combinedResult = el('div');
  section.appendChild(combinedBtn);
  section.appendChild(combinedResult);

  // Material must be offered before Personal (see note above).
  const materialBtn = el(
    'button',
    { className: 'ek-crew-btn' },
    'Material übernehmen'
  );
  const materialResult = el('div');
  section.appendChild(materialBtn);
  section.appendChild(materialResult);

  const personalBtn = el(
    'button',
    { className: 'ek-crew-btn' },
    'Mannschaft übernehmen'
  );
  const personalResult = el('div');
  section.appendChild(personalBtn);
  section.appendChild(personalResult);

  content.appendChild(section);

  combinedBtn.addEventListener('click', () =>
    runCombined(combinedBtn, combinedResult)
  );
  materialBtn.addEventListener('click', () =>
    runTransfer(materialBtn, materialResult, orchestrateMaterial, 'material')
  );
  personalBtn.addEventListener('click', () =>
    runTransfer(personalBtn, personalResult, orchestratePersonal, 'personal')
  );
}

/** Whether the run actually put something into SYBOS (worth reloading for). */
function transferredSomething(result: OrchestrateResult): boolean {
  return (
    !result.error &&
    (result.matched.length > 0 || result.assigned.length > 0)
  );
}

function scheduleReload(resultArea: HTMLElement): void {
  resultArea.appendChild(
    el('div', { className: 'ek-crew-result' }, 'Seite wird aktualisiert…')
  );
  // The detail page's address bar keeps `id=0` even after the einsatz was
  // saved, so a plain reload would drop us back into a new einsatz. Reload the
  // saved einsatz explicitly when we can resolve its real id (see
  // reloadUrlForEinsatz); otherwise fall back to a plain reload.
  const target = reloadUrlForEinsatz(window.location.href, findEinsatzId());
  setTimeout(() => {
    if (target === window.location.href) {
      window.location.reload();
    } else {
      window.location.assign(target);
    }
  }, RELOAD_DELAY_MS);
}

async function runTransfer(
  btn: HTMLButtonElement,
  resultArea: HTMLElement,
  orchestrate: () => Promise<OrchestrateResult>,
  kind: TransferKind
): Promise<void> {
  btn.disabled = true;
  btn.textContent = 'Übertrage...';
  resultArea.replaceChildren();

  try {
    const result = await orchestrate();
    renderResult(resultArea, result, kind);
    if (transferredSomething(result)) {
      scheduleReload(resultArea);
      return;
    }
  } catch (err) {
    console.error('[EK] error transferring to SYBOS:', err);
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

/**
 * Run both flows in the required order: Material first (so its vehicles exist
 * in the Einsatz), then Mannschaft (which assigns people to those vehicles).
 */
async function runCombined(
  btn: HTMLButtonElement,
  resultArea: HTMLElement
): Promise<void> {
  btn.disabled = true;
  btn.textContent = 'Übertrage...';
  resultArea.replaceChildren();

  try {
    const materialResult = await orchestrateMaterial();
    resultArea.appendChild(
      el('div', { className: 'ek-crew-title' }, 'Material')
    );
    renderResult(resultArea, materialResult, 'material');

    const personalResult = await orchestratePersonal();
    resultArea.appendChild(
      el('div', { className: 'ek-crew-title' }, 'Mannschaft')
    );
    renderResult(resultArea, personalResult, 'personal');

    if (
      transferredSomething(materialResult) ||
      transferredSomething(personalResult)
    ) {
      scheduleReload(resultArea);
      return;
    }
  } catch (err) {
    console.error('[EK] error transferring to SYBOS:', err);
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
  if (result.error) {
    resultArea.appendChild(
      el('div', { className: 'ek-crew-result warning' }, `✗ ${result.error}`)
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
      el('div', { className: 'ek-crew-result' }, 'Keine Mannschaft übernommen')
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
      el('div', { className: 'ek-crew-result' }, 'Kein Material übernommen')
    );
  }
}
