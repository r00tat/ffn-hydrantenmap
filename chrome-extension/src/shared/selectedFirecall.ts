/**
 * Loads the firecall stored as `selectedFirecallId`, dropping a selection the
 * signed-in user may not read.
 *
 * The selection lives in `chrome.storage.local` and survives a switch of the
 * Google account. A firecall of a group the new account is not a member of —
 * or one that was deleted — is denied by the Firestore rules. Without this,
 * every request about the "current" firecall fails with "Missing or
 * insufficient permissions" until the popup happens to replace the selection.
 * Other errors (offline, …) keep the selection and are rethrown.
 */
export async function loadSelectedFirecall<T>(
  load: () => Promise<{ firecall: T | null }>,
  clearSelection: () => Promise<void>,
): Promise<{ firecall: T | null }> {
  try {
    return await load();
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code !== 'permission-denied') {
      throw err;
    }
    console.warn('[EK] stored firecall is not readable, dropping selection');
    await clearSelection();
    return { firecall: null };
  }
}
