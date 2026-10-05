import { el } from './sybos-widget';
import {
  orchestratePersonal,
  orchestrateMaterial,
  type MaterialKmMissing,
  type MaterialLineKm,
  type OrchestrateResult,
} from './sybos-orchestrate';
import { orchestrateGeraete, type GeraeteResult } from './sybos-geraete';
import { findEinsatzId, reloadUrlForEinsatz } from './sybos-post';
import {
  TRANSFER_BLOCK_MESSAGES,
  hasUnsavedChanges,
  isEinsatzDetailPage,
  onUnsavedChange,
  transferBlock,
  watchUnsavedChanges,
} from './sybos-einsatz-state';
import { hasSybosPersonTable } from './sybos-table';
import { hasSybosVehicleList } from './sybos-vehicle-list';
import { hasSybosVehicleTable } from './sybos-vehicle-table';
import { hasSybosMannschaftEditTable } from './sybos-mannschaft-edit-table';

type TransferKind = 'personal' | 'material';

/** Delay before auto-reloading, so the result summary is briefly visible. */
const RELOAD_DELAY_MS = 1800;

/**
 * Append the "Automatisch übernehmen" section with the one-click transfer
 * buttons. Renders on the SYBOS Einsatz form — but not while one of the
 * interactive selection/edit pages (which render their own section) is shown.
 *
 * The buttons stay disabled, with a hint, until the Einsatz is saved: a new
 * Einsatz has no id to post to yet, and unsaved edits would be lost on the
 * reload after the transfer (see `sybos-einsatz-state.ts`).
 *
 * Button order matters: Material and Geräte must run before Mannschaft,
 * because a person can only be assigned to a vehicle that already exists in
 * the Einsatz. The combined button enforces that order in a single click.
 */
export function renderAutoTransferSection(content: HTMLElement): void {
  const einsatzId = findEinsatzId();
  if (!einsatzId && !isEinsatzDetailPage(window.location.href)) return;
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
  const hint = el('div', { className: 'ek-crew-result warning' });
  section.appendChild(hint);

  const addButton = (label: string): [HTMLButtonElement, HTMLElement] => {
    const btn = el('button', { className: 'ek-crew-btn' }, label);
    const result = el('div');
    section.appendChild(btn);
    section.appendChild(result);
    return [btn, result];
  };

  // Primary: all steps in the correct order (Material, Geräte, Mannschaft).
  const [combinedBtn, combinedResult] = addButton(
    'Material, Geräte & Mannschaft übernehmen'
  );
  // Material and Geräte are offered before Personal (see note above).
  const [materialBtn, materialResult] = addButton('Material übernehmen');
  const [geraeteBtn, geraeteResult] = addButton('Geräte übernehmen');
  const [personalBtn, personalResult] = addButton('Mannschaft übernehmen');
  const buttons = [combinedBtn, materialBtn, geraeteBtn, personalBtn];

  content.appendChild(section);

  const applyBlock = () => {
    const block = transferBlock({
      einsatzId,
      unsavedChanges: hasUnsavedChanges(),
    });
    hint.textContent = block ? `⚠ ${TRANSFER_BLOCK_MESSAGES[block]}` : '';
    hint.hidden = !block;
    for (const btn of buttons) btn.disabled = block !== null;
  };
  applyBlock();
  watchUnsavedChanges();
  // The panel is rebuilt on every Einsatz switch; a detached section must not
  // keep listening.
  const unsubscribe = onUnsavedChange(() => {
    if (!section.isConnected) {
      unsubscribe();
      return;
    }
    applyBlock();
  });

  combinedBtn.addEventListener('click', () =>
    runCombined(combinedBtn, combinedResult)
  );
  materialBtn.addEventListener('click', () =>
    runTransfer(materialBtn, materialResult, orchestrateMaterial, 'material')
  );
  geraeteBtn.addEventListener('click', () =>
    runGeraete(geraeteBtn, geraeteResult)
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
 * Run all flows in the required order: Material first (so its vehicles exist
 * in the Einsatz), then Geräte, then Mannschaft (which assigns people to
 * those vehicles).
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

    const geraeteResult = await orchestrateGeraete();
    resultArea.appendChild(
      el('div', { className: 'ek-crew-title' }, 'Geräte')
    );
    renderGeraeteResult(resultArea, geraeteResult);

    const personalResult = await orchestratePersonal();
    resultArea.appendChild(
      el('div', { className: 'ek-crew-title' }, 'Mannschaft')
    );
    renderResult(resultArea, personalResult, 'personal');

    if (
      transferredSomething(materialResult) ||
      geraeteTransferred(geraeteResult) ||
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

/**
 * Why a line kept SYBOS's own Anzahl value. Named for the person reading the
 * panel: they should see whether to fix a name in the Fahrtenbuch master data,
 * to enter a missing trip, or that there is simply nothing to enter.
 */
const KM_MISSING_LABELS: Record<MaterialKmMissing, string> = {
  noVehicle: 'nicht im Fahrtenbuch',
  noEntry: 'keine Fahrt zu diesem Einsatz',
  noCounter: 'kein Kilometerzähler',
  unknownLine: 'Zeile keinem Fahrzeug zuzuordnen',
  ambiguousLine: 'Name passt auf mehrere Fahrzeuge',
};

function renderKilometers(
  resultArea: HTMLElement,
  lines: MaterialLineKm[]
): void {
  const withKm = lines.filter((line) => line.km !== undefined);
  const withoutKm = lines.filter((line) => line.km === undefined);

  if (withKm.length > 0) {
    resultArea.appendChild(
      el(
        'div',
        { className: 'ek-crew-result success' },
        `✓ ${withKm.length}× Kilometer eingetragen`
      )
    );
    appendNames(
      resultArea,
      withKm.map((line) => `${line.label}: ${line.km} km`)
    );
  }

  if (withoutKm.length > 0) {
    resultArea.appendChild(
      el(
        'div',
        { className: 'ek-crew-result warning' },
        `⚠ ${withoutKm.length}× ohne Kilometer`
      )
    );
    appendNames(
      resultArea,
      withoutKm.map(
        (line) =>
          `${line.label} — ${
            line.missing ? KM_MISSING_LABELS[line.missing] : 'unbekannt'
          }`
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

  renderKilometers(resultArea, result.kilometers);

  if (result.matched.length === 0 && result.notFound.length === 0) {
    resultArea.appendChild(
      el('div', { className: 'ek-crew-result' }, 'Kein Material übernommen')
    );
  }
}

/** Geräte count as transferred even when a later list failed. */
function geraeteTransferred(result: GeraeteResult): boolean {
  return result.matched.length > 0;
}

async function runGeraete(
  btn: HTMLButtonElement,
  resultArea: HTMLElement
): Promise<void> {
  btn.disabled = true;
  btn.textContent = 'Übertrage...';
  resultArea.replaceChildren();

  const result = await orchestrateGeraete();
  renderGeraeteResult(resultArea, result);
  if (geraeteTransferred(result)) {
    scheduleReload(resultArea);
    return;
  }

  btn.textContent = 'Erneut übernehmen';
  btn.disabled = false;
}

function renderGeraeteResult(
  resultArea: HTMLElement,
  result: GeraeteResult
): void {
  for (const warning of result.warnings) {
    resultArea.appendChild(
      el('div', { className: 'ek-crew-result warning' }, `⚠ ${warning}`)
    );
  }

  if (result.matched.length > 0) {
    resultArea.appendChild(
      el(
        'div',
        { className: 'ek-crew-result success' },
        `✓ ${result.matched.length} übernommen`
      )
    );
    appendNames(
      resultArea,
      result.amounts.map((amount) => {
        if (amount.anzahl === undefined) return `${amount.label} — ohne Anzahl`;
        const unit = amount.einheit === 'h' ? ' h' : '';
        const rounded =
          amount.gerundet !== undefined ? ` (gerundet aus ${amount.gerundet})` : '';
        return `${amount.label}: ${amount.anzahl}${unit}${rounded}`;
      })
    );
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

  // An error after a partial run (Geräte saved, Container failed) still shows
  // what made it in above.
  if (result.error) {
    resultArea.appendChild(
      el('div', { className: 'ek-crew-result warning' }, `✗ ${result.error}`)
    );
  } else if (result.matched.length === 0 && result.notFound.length === 0) {
    resultArea.appendChild(
      el('div', { className: 'ek-crew-result' }, 'Keine Geräte übernommen')
    );
  }
}
