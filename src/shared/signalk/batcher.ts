import type { Value } from './types';

type Schedule = (cb: (epoch: number) => void) => void;

// The epoch stamped on each flush is a wall clock (Date.now), not the scheduler's
// timestamp: the batcher runs in the worker where requestAnimationFrame is absent, so
// the rAF callback's high-res timestamp is unavailable and would in any case use a
// different time origin than the main thread that prunes by staleness. Date.now is
// consistent across both threads.
const defaultSchedule: Schedule =
  typeof requestAnimationFrame === 'function'
    ? (cb) => {
        requestAnimationFrame(() => cb(Date.now()));
      }
    : (cb) => {
        setTimeout(() => cb(Date.now()), 16);
      };

export class FrameBatcher {
  onFlush?: (
    self: Record<string, Value>,
    ais: Map<string, Map<string, Value>>,
    epoch: number,
  ) => void;

  #self = new Map<string, Value>();
  #ais = new Map<string, Map<string, Value>>();
  #scheduled = false;
  #schedule: Schedule;

  constructor(schedule: Schedule = defaultSchedule) {
    this.#schedule = schedule;
  }

  put(path: string, value: Value): void {
    this.#self.set(path, value);
    this.#mark();
  }

  putVessel(context: string, path: string, value: Value): void {
    let vessel = this.#ais.get(context);
    if (!vessel) {
      vessel = new Map();
      this.#ais.set(context, vessel);
    }
    vessel.set(path, value);
    this.#mark();
  }

  #mark(): void {
    if (this.#scheduled) return;
    this.#scheduled = true;
    this.#schedule((epoch) => this.#flush(epoch));
  }

  #flush(epoch: number): void {
    this.#scheduled = false;
    if (this.#self.size === 0 && this.#ais.size === 0) return;
    const self = Object.fromEntries(this.#self);
    const ais = this.#ais;
    this.#self = new Map();
    this.#ais = new Map();
    this.onFlush?.(self, ais, epoch);
  }
}
