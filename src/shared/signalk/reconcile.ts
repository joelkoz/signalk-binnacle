import { type Context, type Delta, hasValues } from '@signalk/server-api';
import type { LeafWrite } from './types';

const SELF_CONTEXT = 'vessels.self' as Context;

export function reconcileDelta(delta: Delta, onLeaf: (write: LeafWrite) => void): void {
  const context = (delta.context ?? SELF_CONTEXT) as Context;
  const updates = delta.updates ?? [];
  for (const update of updates) {
    if (!hasValues(update)) continue;
    for (const pv of update.values) {
      onLeaf({ context, path: pv.path, value: pv.value });
    }
  }
}
