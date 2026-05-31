import type { Value } from '@signalk/server-api';
import type { ConnectionState, SKFrame } from './types';

export class PathCell {
  value = $state<Value | undefined>(undefined);
  receivedAt = $state(0);
}

export class SignalKStore {
  connection = $state<ConnectionState>({ phase: 'connecting', attempt: 0, since: 0 });

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
    this.connection = frame.connection;
  }
}
