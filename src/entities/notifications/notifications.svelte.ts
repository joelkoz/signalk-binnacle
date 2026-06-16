import type { NotificationState, SignalKStore } from '$shared/signalk';

// Sort rank for the raised grades; lower is more severe. Doubles as the membership test:
// a state outside this table (normal, nominal, or junk) is not an active alert.
const SEVERITY_RANK: Record<string, number> = { emergency: 0, alarm: 1, warn: 2, alert: 3 };

export interface ActiveNotification {
  path: string;
  state: NotificationState;
  message: string;
  method: string[];
  // ISO 8601, from the value's createdAt when the producer included it.
  timestamp?: string;
  // The v2 notification id the server stamps on the value; absent on pre-2.28 servers,
  // and required for the REST silence, acknowledge, and clear routes.
  id?: string;
  silenced?: boolean;
  acknowledged?: boolean;
  canSilence?: boolean;
  canAcknowledge?: boolean;
}

function parseNotification(path: string, value: unknown): ActiveNotification | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const state = raw.state;
  // Object.hasOwn, not `in`: a junk state like 'constructor' must not match the prototype.
  if (typeof state !== 'string' || !Object.hasOwn(SEVERITY_RANK, state)) return undefined;
  const method = Array.isArray(raw.method)
    ? raw.method.filter((m): m is string => typeof m === 'string')
    : [];
  const status =
    raw.status && typeof raw.status === 'object' ? (raw.status as Record<string, unknown>) : {};
  const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
  return {
    path,
    state: state as NotificationState,
    message: typeof raw.message === 'string' ? raw.message : '',
    method,
    timestamp: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    id: typeof raw.id === 'string' ? raw.id : undefined,
    silenced: bool(status.silenced),
    acknowledged: bool(status.acknowledged),
    canSilence: bool(status.canSilence),
    canAcknowledge: bool(status.canAcknowledge),
  };
}

// Wraps the SignalKStore notifications mirror the way AisTargets wraps aisTargets: a memoized
// severity-sorted list of the raised notifications, rebuilt only when the mirror version moves.
export class NotificationsStore {
  #store: SignalKStore;
  #cache: ActiveNotification[] | undefined;
  #cacheVersion = -1;

  constructor(store: SignalKStore) {
    this.#store = store;
  }

  // Reading this in a reactive context takes a dependency on notification changes; list()
  // reads it too, so a $derived around list() re-runs when the mirror moves.
  get version(): number {
    return this.#store.notificationsVersion;
  }

  list(): ActiveNotification[] {
    const version = this.#store.notificationsVersion;
    if (this.#cache && this.#cacheVersion === version) return this.#cache;
    const out: ActiveNotification[] = [];
    for (const [path, value] of this.#store.notifications) {
      const parsed = parseNotification(path, value);
      if (parsed) out.push(parsed);
    }
    out.sort(
      (a, b) =>
        SEVERITY_RANK[a.state] - SEVERITY_RANK[b.state] ||
        (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    );
    this.#cache = out;
    this.#cacheVersion = version;
    return out;
  }
}
