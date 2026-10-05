/**
 * Is the SYBOS Einsatz saved — may the one-click transfer run?
 *
 * The transfer posts in the background and then reloads the Einsatz page to
 * show the result. That only works on a saved Einsatz:
 *
 * - A new Einsatz that was never saved has no id. SYBOS exposes the id only
 *   in the `idParent=<id>` popup links once it exists (see `findEinsatzId`),
 *   and there is nothing to attach Material or Mannschaft to.
 * - Changes typed into the form but not saved are lost on the reload. That
 *   includes the texts „Texte eintragen" fills in — they too wait for SYBOS's
 *   own save button.
 *
 * Saving in SYBOS submits the whole page, so the content script starts over
 * and the state is fresh: the id is there and nothing is unsaved.
 */

export type TransferBlock = 'unsaved' | 'dirty';

export const TRANSFER_BLOCK_MESSAGES: Record<TransferBlock, string> = {
  unsaved: 'Einsatz zuerst in SYBOS speichern — danach lässt sich übernehmen.',
  dirty: 'Ungespeicherte Änderungen — zuerst in SYBOS speichern, sonst gehen sie beim Neuladen verloren.',
};

/** The Einsatz form (`frmEinsatzAdd`), new (`id=0`) or existing. */
export function isEinsatzDetailPage(href: string): boolean {
  try {
    const params = new URL(href).searchParams;
    return params.get('comp') === 'sybEinsatz' && params.get('s') === 'frmEinsatzAdd';
  } catch {
    return false;
  }
}

/** Why the transfer must wait, or `null` when it may run. */
export function transferBlock(state: {
  einsatzId: string | null;
  unsavedChanges: boolean;
}): TransferBlock | null {
  if (!state.einsatzId) return 'unsaved';
  if (state.unsavedChanges) return 'dirty';
  return null;
}

const WIDGET_SELECTOR = '#einsatzkarte-widget';

let unsavedChanges = false;
let watchedRoot: Document | null = null;
const listeners = new Set<() => void>();

function handleEdit(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(WIDGET_SELECTOR)) return;
  if (!target.closest('form')) return;
  if (unsavedChanges) return;
  unsavedChanges = true;
  for (const listener of listeners) listener();
}

/**
 * Start noticing edits to the SYBOS form. Idempotent: the panel is rebuilt on
 * every Einsatz switch, the watch must survive that and stay single.
 */
export function watchUnsavedChanges(root: Document = document): void {
  if (watchedRoot === root) return;
  watchedRoot?.removeEventListener('input', handleEdit, true);
  watchedRoot?.removeEventListener('change', handleEdit, true);
  root.addEventListener('input', handleEdit, true);
  root.addEventListener('change', handleEdit, true);
  watchedRoot = root;
}

export function hasUnsavedChanges(): boolean {
  return unsavedChanges;
}

/** Called once, when the first unsaved change appears. */
export function onUnsavedChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For tests: forget edits, listeners and the watched document. */
export function resetUnsavedChanges(): void {
  watchedRoot?.removeEventListener('input', handleEdit, true);
  watchedRoot?.removeEventListener('change', handleEdit, true);
  watchedRoot = null;
  unsavedChanges = false;
  listeners.clear();
}
