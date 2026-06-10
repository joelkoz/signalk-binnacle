import type { Value } from './types';

// A scheduler returns a cancel function, so a pending flush can be dropped on teardown rather than
// firing into a store the app is disposing.
type Schedule = (cb: (epoch: number) => void) => () => void;

// The epoch stamped on each flush is a wall clock (Date.now), not the scheduler's
// timestamp: the batcher runs in the worker where requestAnimationFrame is absent, so
// the rAF callback's high-res timestamp is unavailable and would in any case use a
// different time origin than the main thread that prunes by staleness. Date.now is
// consistent across both threads.
const defaultSchedule: Schedule =
  typeof requestAnimationFrame === 'function'
    ? (cb) => {
        const id = requestAnimationFrame(() => cb(Date.now()));
        return () => cancelAnimationFrame(id);
      }
    : (cb) => {
        const id = setTimeout(() => cb(Date.now()), 16);
        return () => clearTimeout(id);
      };

export class FrameBatcher {
  onFlush?: (self: Map<string, Value>, ais: Map<string, Map<string, Value>>, epoch: number) => void;

  #self = new Map<string, Value>();
  #ais = new Map<string, Map<string, Value>>();
  #scheduled = false;
  #cancel: (() => void) | undefined;
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

  // Drop any pending flush and clear the buffers, so a flush scheduled before teardown cannot fire
  // into a store the app is disposing. Leaves the batcher reusable: a later put schedules afresh.
  reset(): void {
    this.#cancel?.();
    this.#cancel = undefined;
    this.#scheduled = false;
    this.#self.clear();
    this.#ais.clear();
  }

  #mark(): void {
    if (this.#scheduled) return;
    this.#scheduled = true;
    this.#cancel = this.#schedule((epoch) => this.#flush(epoch));
  }

  #flush(epoch: number): void {
    this.#scheduled = false;
    this.#cancel = undefined;
    if (this.#self.size === 0 && this.#ais.size === 0) return;
    // Hand off the accumulated maps directly and start fresh. self mirrors how ais is already
    // passed: a Map crosses the Comlink boundary by structured clone, so neither needs converting
    // to a plain object on the hot path. Subsequent puts land in the new maps, not the handed-off
    // ones.
    const self = this.#self;
    const ais = this.#ais;
    this.#self = new Map();
    this.#ais = new Map();
    this.onFlush?.(self, ais, epoch);
  }
}
