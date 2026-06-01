import type { AisTargetState, ConnectionState, SKFrame, Value } from './types';

export class PathCell {
  value = $state<Value | undefined>(undefined);
  receivedAt = $state(0);
}

export class SignalKStore {
  connection = $state<ConnectionState>({ phase: 'connecting', attempt: 0, since: 0 });
  readonly aisTargets = new Map<string, AisTargetState>();

  // Bumped on every AIS change, so a consumer can skip rebuilding when nothing moved.
  aisVersion = 0;

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
    for (const path in frame.self) {
      const cell = this.cell(path);
      cell.value = frame.self[path];
      cell.receivedAt = frame.epoch;
    }
    if (frame.ais) {
      for (const context in frame.ais) {
        let target = this.aisTargets.get(context);
        if (!target) {
          target = { values: new Map(), lastUpdate: frame.epoch };
          this.aisTargets.set(context, target);
        }
        const incoming = frame.ais[context];
        for (const path in incoming) target.values.set(path, incoming[path]);
        target.lastUpdate = frame.epoch;
      }
      this.aisVersion += 1;
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
