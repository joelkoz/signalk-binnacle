import type { AisTargetState, ConnectionState, SKFrame, Value } from './types';
import { INITIAL_CONNECTION_STATE } from './types';

export class PathCell {
  value = $state<Value | undefined>(undefined);
  // The wall-clock epoch of the most recent stream update, for staleness checks. Zero until the
  // first value arrives. Reactive so a consumer comparing it against a ticking clock re-renders
  // when a fresh value lands. Seeded cells (the course REST hydration writes value directly, not
  // through applyFrame) leave this at zero, which is correct: those are not stream-aged.
  epoch = $state(0);
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
      const cell = this.cell(path);
      cell.value = value;
      cell.epoch = frame.epoch;
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
    // The worker sends a fresh connection object on every frame; assigning it unconditionally
    // would re-run every connection-derived consumer once per animation frame.
    const incoming = frame.connection;
    if (incoming.phase !== this.connection.phase || incoming.attempt !== this.connection.attempt) {
      this.connection = incoming;
    }
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
