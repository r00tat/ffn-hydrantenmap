/** Fehler, mit dem `withTimeout` nach Ablauf der Zeit ablehnt. */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Begrenzt das Warten auf ein Versprechen.
 *
 * Offline scheitert ein Abruf nicht immer schnell: In einem WLAN ohne Internet
 * oder bei einer Mobilverbindung ohne Durchsatz hängt er, bis der Browser
 * aufgibt. Wer darauf wartet (Anmeldung, Server Actions beim Start), soll
 * stattdessen nach `ms` auf seinen Rückfall umschalten. Das ursprüngliche
 * Versprechen läuft weiter; es wird nur nicht mehr abgewartet.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'operation',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
