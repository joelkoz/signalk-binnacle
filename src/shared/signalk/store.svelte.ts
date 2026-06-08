import type { AisTargetState, ConnectionState, SKFrame, Value } from './types';
import { INITIAL_CONNECTION_STATE } from './types';

export class PathCell {
  value = $state<Value | undefined>(undefined);
}

export class SignalKStore {
  connection = $state<ConnectionState>(INITIAL_CONNECTION_STATE);
  readonly aisTargets = new Map<string, AisTargetState>();

  // Bumped on every AIS change, so a consumer can skip rebuilding when nothing moved.
  // Reactive so a $derived or $effect consumer is notified, not only the rAF poll.
  aisVersion = $state(0);

  #cells = new Map<string, PathCell>();

  cell(path: string): PathCell {
    let cell = this.#cells.get(path);
    if (!cell) {
      cell = new PathCell();
      this.#cells.set(path, cell);
    }
    return cell;
  }

  applyFrame(frame: SKFrame): void {
    for (const [path, value] of frame.self) {
      this.cell(path).value = value;
    }
    if (frame.ais) {
      for (const [context, incoming] of frame.ais) {
        let target = this.aisTargets.get(context);
        if (!target) {
          target = { values: new Map(), lastUpdate: frame.epoch };
          this.aisTargets.set(context, target);
        }
        for (const [path, value] of incoming) target.values.set(path, value);
        target.lastUpdate = frame.epoch;
      }
      // Bump only when a context actually updated. The worker emits an `ais` Map on every frame
      // (empty when only self moved), so guarding on size keeps the version stable when nothing
      // moved and the consumers' version guards still hold.
      if (frame.ais.size > 0) this.aisVersion += 1;
    }
    this.connection = frame.connection;
  }

  pruneAis(now: number, ttlMs: number): number {
    let removed = 0;
    for (const [context, target] of this.aisTargets) {
      if (now - target.lastUpdate > ttlMs) {
        this.aisTargets.delete(context);
        removed += 1;
      }
    }
    if (removed > 0) this.aisVersion += 1;
    return removed;
  }
}
