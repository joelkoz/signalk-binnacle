import type { ExtContext, SignalKAdapter } from './adapters';
import type { StateScope } from './state-store';

// Structural view of one bus connection, so the relay can route events without depending on the bus
// package (the components pass the real HostConnection, which satisfies this).
export interface HostBusConnection {
  publish(eventName: string, params?: unknown): boolean;
}

interface Registration {
  conn: HostBusConnection;
  context: ExtContext;
}

// A bound on how many distinct Signal K paths one context may subscribe to, mirroring the per
// extension byte quota in the state store. It keeps a misbehaving extension from growing the host's
// upstream subscription and the per-tick relay set without limit.
const MAX_PATHS_PER_CONTEXT = 64;

function getOrCreate<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  let value = map.get(key);
  if (value === undefined) {
    value = make();
    map.set(key, value);
  }
  return value;
}

// The non-reactive Signal K relay engine. It owns the per-context registry, the subscribed path
// bookkeeping, and the hot per-tick relay that pushes changed Signal K values to subscribed
// contexts. It is split out of the reactive host store so the layout state and this hot path do not
// share one class. It takes the SignalKAdapter as a constructor dependency and is unit testable with
// fakes.
export class ExtRelay {
  readonly #signalk: SignalKAdapter;

  readonly #registry: Registration[] = [];
  readonly #paths = new Map<ExtContext, Set<string>>();
  readonly #subById = new Map<string, { context: ExtContext; paths: string[] }>();
  readonly #lastSent = new Map<ExtContext, Map<string, string>>();
  #relay: ReturnType<typeof setInterval> | undefined;
  #subSeq = 0;

  constructor(signalk: SignalKAdapter) {
    this.#signalk = signalk;
  }

  register(conn: HostBusConnection, context: ExtContext): void {
    this.#registry.push({ conn, context });
  }

  unregister(conn: HostBusConnection): void {
    const index = this.#registry.findIndex((r) => r.conn === conn);
    if (index < 0) return;
    const [removed] = this.#registry.splice(index, 1);
    this.#paths.delete(removed.context);
    this.#lastSent.delete(removed.context);
    for (const [id, entry] of this.#subById) {
      if (entry.context === removed.context) this.#subById.delete(id);
    }
  }

  addSubscription(context: ExtContext, paths: readonly string[]): { subscriptionId: string } {
    const set = getOrCreate(this.#paths, context, () => new Set<string>());
    const admitted: string[] = [];
    for (const path of paths) {
      if (!set.has(path) && set.size >= MAX_PATHS_PER_CONTEXT) {
        throw new Error(`signalk.subscribe: path cap (${MAX_PATHS_PER_CONTEXT}) reached`);
      }
      set.add(path);
      admitted.push(path);
    }
    this.#signalk.ensurePaths(admitted);
    const subscriptionId = `sk-${++this.#subSeq}`;
    this.#subById.set(subscriptionId, { context, paths: admitted });
    return { subscriptionId };
  }

  removeSubscription(subscriptionId: string | undefined): void {
    if (!subscriptionId) return;
    const entry = this.#subById.get(subscriptionId);
    if (!entry) return;
    const set = this.#paths.get(entry.context);
    if (set) for (const path of entry.paths) set.delete(path);
    this.#subById.delete(subscriptionId);
  }

  publishState(
    extensionId: string,
    scope: StateScope,
    instanceId: string | null,
    keys: string[],
  ): void {
    for (const { conn, context } of this.#registry) {
      if (context.extensionId === extensionId) {
        conn.publish('state.changed', { scope, instanceId, keys });
      }
    }
  }

  publishFilters(extensionId: string, type: string, active: boolean): void {
    for (const { conn, context } of this.#registry) {
      if (context.extensionId === extensionId) conn.publish('filters.changed', { type, active });
    }
  }

  // Deliver a sendMessage topic to every live context; the bus filters by each context's event
  // subscriptions, so an unheard topic simply does nothing.
  publishTopic(topic: string, params?: unknown): void {
    for (const { conn } of this.#registry) conn.publish(topic, params);
  }

  // Push changed Signal K values to subscribed contexts. Idempotent per (context, path): a value is
  // re-published only when its timestamp or value changed since the last push.
  pumpSignalK(): void {
    for (const { conn, context } of this.#registry) {
      const paths = this.#paths.get(context);
      if (!paths || paths.size === 0) continue;
      const sent = getOrCreate(this.#lastSent, context, () => new Map<string, string>());
      for (const path of paths) {
        const reading = this.#signalk.read(path);
        if (!reading) continue;
        // A Signal K timestamp advances with each value, so it is a sufficient change signal on its
        // own; only fall back to serializing the value when a reading carries no timestamp. This
        // keeps the per-tick relay from stringifying every value on every pump.
        const signature = reading.timestamp ?? JSON.stringify(reading.value);
        if (sent.get(path) === signature) continue;
        sent.set(path, signature);
        conn.publish(`sk.${path}`, {
          path,
          value: reading.value,
          timestamp: reading.timestamp,
          $source: reading.$source,
        });
      }
    }
  }

  startRelay(intervalMs = 500): void {
    if (this.#relay) return;
    this.#relay = setInterval(() => this.pumpSignalK(), intervalMs);
  }

  stopRelay(): void {
    if (this.#relay) clearInterval(this.#relay);
    this.#relay = undefined;
  }
}
