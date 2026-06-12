import {
  type Context,
  type Path,
  SELF_CONTEXT,
  type SubscribeEntry,
  type SubscribePolicy,
} from './types';

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
        // The first subscriber's parameters stand for the key's lifetime; a differing later
        // demand is silently coalesced, so flag it in dev where it is a real mistake.
        if (
          import.meta.env?.DEV &&
          (existing.entry.period !== resolved.period ||
            existing.entry.minPeriod !== resolved.minPeriod ||
            existing.entry.policy !== resolved.policy)
        ) {
          console.warn(
            `[signalk] subscription ${key} is already active with different parameters; the new period, minPeriod, or policy is ignored`,
          );
        }
      } else {
        this.#demand.set(key, { count: 1, entry: resolved });
        this.#sendSubscribe(resolved);
      }
      keys.push(key);
    }
    // The release closure is deliberate API surface for future per-feature subscriptions: today
    // only tests exercise it (Comlink cannot return a closure across the worker boundary, so
    // production removal flows through remove()).
    return () => this.#release(keys);
  }

  // Drop demand by path and context, the same refcounted accounting as the closure
  // returned by add(). The worker core routes unsubscribe through here so a dropped
  // path also leaves #demand and is not resurrected by resubscribeAll on reconnect.
  remove(paths: Path[], context?: Context): void {
    const ctx = context ?? SELF_CONTEXT;
    for (const path of paths) this.#drop(`${ctx}|${path}`);
  }

  resubscribeAll(): void {
    // Batch by context so a reconnect re-sends one subscribe message per context, not one per path.
    const byContext = new Map<Context, Record<string, unknown>[]>();
    for (const { entry } of this.#demand.values()) {
      const list = byContext.get(entry.context);
      if (list) list.push(this.#subscription(entry));
      else byContext.set(entry.context, [this.#subscription(entry)]);
    }
    for (const [context, subscribe] of byContext) this.#send({ context, subscribe });
  }

  #release(keys: string[]): void {
    for (const key of keys) this.#drop(key);
  }

  #drop(key: string): void {
    const demand = this.#demand.get(key);
    if (!demand) return;
    demand.count -= 1;
    if (demand.count > 0) return;
    this.#demand.delete(key);
    this.#send({
      context: demand.entry.context,
      unsubscribe: [{ path: demand.entry.path }],
    });
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

  #subscription(entry: Resolved): Record<string, unknown> {
    const subscription: Record<string, unknown> = {
      path: entry.path,
      period: entry.period,
      policy: entry.policy,
    };
    if (entry.minPeriod !== undefined) subscription.minPeriod = entry.minPeriod;
    return subscription;
  }

  #sendSubscribe(entry: Resolved): void {
    this.#send({ context: entry.context, subscribe: [this.#subscription(entry)] });
  }
}
