export async function allSettled<T>(promises: Promise<T>[]) {
  const results = await Promise.allSettled(promises);
  results
    .filter((p) => p.status === 'rejected')
    .map((p) => (p as PromiseRejectedResult).reason)
    .forEach(console.warn);

  return results
    .filter((p) => p.status === 'fulfilled')
    .map((p) => (p as PromiseFulfilledResult<T>).value);
}
