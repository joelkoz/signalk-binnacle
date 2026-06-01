import type { Context, Path, SubscribeEntry, SubscribePolicy } from './types';

const SELF_CONTEXT = 'vessels.self' as Context;
const DEFAULT_PERIOD = 1000;
const DEFAULT_POLICY: SubscribePolicy = 'ideal';

interface Resolved {
  context: Context;
  path: Path;
  period: number;
  minPeriod?: number;
  policy: SubscribePolicy;
}

interface Demand {
  count: number;
  entry: Resolved;
}

export class SubscriptionRegistry {
  #demand = new Map<string, Demand>();
  #send: (message: unknown) => void;

  constructor(send: (message: unknown) => void) {
    this.#send = send;
  }

  add(entries: SubscribeEntry[]): () => void {
    const keys: string[] = [];
    for (const entry of entries) {
      const resolved = this.#resolve(entry);
      const key = `${resolved.context}|${resolved.path}`;
      const existing = this.#demand.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        this.#demand.set(key, { count: 1, entry: resolved });
        this.#sendSubscribe(resolved);
      }
      keys.push(key);
    }
    return () => this.#release(keys);
  }

  resubscribeAll(): void {
    for (const { entry } of this.#demand.values()) {
      this.#sendSubscribe(entry);
    }
  }

  #release(keys: string[]): void {
    for (const key of keys) {
      const demand = this.#demand.get(key);
      if (!demand) continue;
      demand.count -= 1;
      if (demand.count > 0) continue;
      this.#demand.delete(key);
      this.#send({
        context: demand.entry.context,
        unsubscribe: [{ path: demand.entry.path }],
      });
    }
  }

  #resolve(entry: SubscribeEntry): Resolved {
    return {
      context: entry.context ?? SELF_CONTEXT,
      path: entry.path,
      period: entry.period ?? DEFAULT_PERIOD,
      minPeriod: entry.minPeriod,
      policy: entry.policy ?? DEFAULT_POLICY,
    };
  }

  #sendSubscribe(entry: Resolved): void {
    const subscription: Record<string, unknown> = {
      path: entry.path,
      period: entry.period,
      policy: entry.policy,
    };
    if (entry.minPeriod !== undefined) subscription.minPeriod = entry.minPeriod;
    this.#send({ context: entry.context, subscribe: [subscription] });
  }
}
