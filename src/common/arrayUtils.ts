export function uniqueArray<T = any>(arr: T[]): T[] {
  return arr.filter((v, i) => arr.indexOf(v) === i);
}
