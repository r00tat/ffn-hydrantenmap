export function isTruthy(value: string | boolean | null | undefined) {
  return ['on', 'yes', 'true', 't', true].indexOf(value || false) >= 0;
}
