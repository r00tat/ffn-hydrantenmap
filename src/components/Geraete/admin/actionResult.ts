/**
 * Aufruf einer Server Action aus der Lagerseite, einheitlich ausgewertet.
 *
 * Die Actions dieses Bereichs melden einen Fehler entweder als Ausnahme oder
 * als `{ success: false, error }` (Bauweise der übrigen Actions im Repo).
 * Die Oberfläche soll beides gleich behandeln: Fehlertext anzeigen, Dialog
 * offen lassen.
 */

export type ActionOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Fehlertext eines Ergebnisses der Form `{ success: false, error }`. */
export function actionErrorOf(result: unknown): string | undefined {
  if (
    result &&
    typeof result === 'object' &&
    'success' in result &&
    (result as { success: unknown }).success === false
  ) {
    const error = (result as { error?: unknown }).error;
    return typeof error === 'string' && error ? error : 'unknown';
  }
  return undefined;
}

export async function callAction<T>(
  run: () => Promise<T>,
): Promise<ActionOutcome<T>> {
  try {
    const value = await run();
    const error = actionErrorOf(value);
    if (error) return { ok: false, error };
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error && err.message ? err.message : String(err),
    };
  }
}
