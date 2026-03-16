import type { InterpolationAlgorithm } from './types';

const registry = new Map<string, InterpolationAlgorithm<any>>();

export function registerAlgorithm<TState>(algo: InterpolationAlgorithm<TState>): void {
  if (registry.has(algo.id)) {
    throw new Error(`Interpolation algorithm '${algo.id}' is already registered`);
  }
  registry.set(algo.id, algo);
}

export function getAlgorithm(id: string): InterpolationAlgorithm<any> | undefined {
  return registry.get(id);
}

export function getAlgorithmList(): InterpolationAlgorithm<any>[] {
  return Array.from(registry.values());
}

/** Reset registry — for testing only. */
export function resetRegistry(): void {
  registry.clear();
}
