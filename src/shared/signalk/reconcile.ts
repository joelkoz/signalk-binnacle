import type { Delta, LeafWrite, PathValue } from './types';

const SELF_CONTEXT = 'vessels.self';

export function reconcileDelta(delta: Delta, onLeaf: (write: LeafWrite) => void): void {
  const context = delta.context ?? SELF_CONTEXT;
  for (const update of delta.updates ?? []) {
    const values: PathValue[] | undefined = update.values;
    if (!Array.isArray(values)) continue;
    for (const pv of values) {
      onLeaf({ context, path: pv.path, value: pv.value });
    }
  }
}
