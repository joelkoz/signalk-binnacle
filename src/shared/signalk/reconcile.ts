import {
  type Context,
  type Delta,
  type Path,
  type PathValue,
  SELF_CONTEXT,
  type Value,
} from './types';

// The hottest path in the app: positional arguments, not a per-value object, so reconciling a
// delta allocates nothing per leaf.
export function reconcileDelta(
  delta: Delta,
  onLeaf: (context: Context, path: Path, value: Value) => void,
): void {
  const context = delta.context ?? SELF_CONTEXT;
  for (const update of delta.updates ?? []) {
    const values: PathValue[] | undefined = update.values;
    if (!Array.isArray(values)) continue;
    for (const pv of values) {
      onLeaf(context, pv.path, pv.value);
    }
  }
}
