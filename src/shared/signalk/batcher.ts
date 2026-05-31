import type { Value } from '@signalk/server-api';

type Schedule = (cb: (epoch: number) => void) => void;

const defaultSchedule: Schedule =
  typeof requestAnimationFrame === 'function'
    ? (cb) => {
        requestAnimationFrame(cb);
      }
    : (cb) => {
        setTimeout(() => cb(0), 16);
      };

export class FrameBatcher {
  onFlush?: (self: Record<string, Value>, epoch: number) => void;

  #self = new Map<string, Value>();
  #scheduled = false;
  #schedule: Schedule;

  constructor(schedule: Schedule = defaultSchedule) {
    this.#schedule = schedule;
  }

  put(path: string, value: Value): void {
    this.#self.set(path, value);
    if (this.#scheduled) return;
    this.#scheduled = true;
    this.#schedule((epoch) => this.#flush(epoch));
  }

  #flush(epoch: number): void {
    this.#scheduled = false;
    if (this.#self.size === 0) return;
    const self = Object.fromEntries(this.#self);
    this.#self = new Map();
    this.onFlush?.(self, epoch);
  }
}
