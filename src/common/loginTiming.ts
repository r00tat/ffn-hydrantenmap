/**
 * Debug timing utility for login flow analysis.
 * Logs the duration of each step to help identify performance bottlenecks.
 *
 * Usage:
 *   const timer = loginTimer('onAuthStateChanged');
 *   timer.step('getIdToken');
 *   await user.getIdToken();
 *   timer.step('serverLogin');
 *   await serverLogin();
 *   timer.done();
 */

const isClient = typeof window !== 'undefined';

function now(): number {
  if (isClient && typeof performance !== 'undefined') {
    return performance.now();
  }
  return Date.now();
}

export function loginTimer(label: string) {
  const prefix = isClient ? '[login-timing]' : '[login-timing:server]';
  const start = now();
  let lastStep = start;
  let stepName = 'start';

  console.info(`${prefix} ${label} started`);

  return {
    step(name: string) {
      const current = now();
      const sinceStart = (current - start).toFixed(0);
      const sinceLast = (current - lastStep).toFixed(0);
      console.info(
        `${prefix} ${label} | ${stepName} took ${sinceLast}ms (total: ${sinceStart}ms) → ${name}`
      );
      lastStep = current;
      stepName = name;
    },
    done() {
      const current = now();
      const sinceStart = (current - start).toFixed(0);
      const sinceLast = (current - lastStep).toFixed(0);
      console.info(
        `${prefix} ${label} | ${stepName} took ${sinceLast}ms | TOTAL: ${sinceStart}ms`
      );
    },
  };
}

/**
 * Server-side timing for NextAuth callbacks and server actions.
 */
export function serverLoginTimer(label: string) {
  return loginTimer(label);
}
