// Firestore does not accept `undefined` — strip both `undefined` and `null`
// before persisting documents.
export function stripNullish<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key];
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}
