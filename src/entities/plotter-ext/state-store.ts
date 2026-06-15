import { PersistedValue } from '$shared/settings';

// Host-persisted key/value storage for extensions (state.get / state.set). Two scopes per the
// spec: `instance`, keyed by a widget placement's instance id, and `extension`, shared across an
// extension's contexts. Backed by PersistedValue (localStorage) so a placed widget's
// configuration survives a reload; the persistence backend and quota are host-defined.

export type StateScope = 'instance' | 'extension';

type KeyValues = Record<string, unknown>;

interface ExtensionState {
  extension?: KeyValues;
  instances?: Record<string, KeyValues>;
}

type StateData = Record<string, ExtensionState>;

// A generous per-extension cap so one extension cannot exhaust localStorage; far above any sane
// widget configuration. Exceeding it rejects the write rather than silently dropping data.
const MAX_EXTENSION_BYTES = 256 * 1024;

const STORAGE_KEY = 'binnacle:plotterext:state';

export class PlotterExtState {
  readonly #store: PersistedValue<StateData>;

  constructor(persisted: PersistedValue<StateData> = new PersistedValue(STORAGE_KEY, {})) {
    this.#store = persisted;
  }

  #bucket(data: StateData, extensionId: string, scope: StateScope, instanceId: string | null) {
    const ext = data[extensionId];
    if (scope === 'extension') return ext?.extension;
    if (!instanceId) return undefined;
    return ext?.instances?.[instanceId];
  }

  // Read stored values for a context. With `keys`, only those keys are returned (missing keys are
  // omitted); without, the whole bucket is returned. An unknown scope/instance reads as empty.
  get(
    extensionId: string,
    scope: StateScope,
    instanceId: string | null,
    keys?: readonly string[],
  ): KeyValues {
    const bucket = this.#bucket(this.#store.value, extensionId, scope, instanceId);
    if (!bucket) return {};
    if (!keys) return { ...bucket };
    const out: KeyValues = {};
    for (const key of keys) {
      if (key in bucket) out[key] = bucket[key];
    }
    return out;
  }

  // Merge values into a context's bucket and persist. Returns the keys written, for the
  // state.changed event the caller publishes. Throws when the extension's state would exceed the
  // size cap, so the failure surfaces to the extension rather than corrupting storage.
  set(
    extensionId: string,
    scope: StateScope,
    instanceId: string | null,
    values: KeyValues,
  ): string[] {
    if (scope === 'instance' && !instanceId) {
      throw new Error('instance-scoped state requires an instance id');
    }
    const data = { ...this.#store.value };
    const ext: ExtensionState = { ...data[extensionId] };
    if (scope === 'extension') {
      ext.extension = { ...ext.extension, ...values };
    } else {
      const instances = { ...ext.instances };
      instances[instanceId as string] = { ...instances[instanceId as string], ...values };
      ext.instances = instances;
    }
    if (JSON.stringify(ext).length > MAX_EXTENSION_BYTES) {
      throw new Error('extension state quota exceeded');
    }
    data[extensionId] = ext;
    this.#store.set(data);
    return Object.keys(values);
  }

  // Drop all stored state for one widget instance, used when a placement is removed so its
  // configuration does not linger.
  removeInstance(extensionId: string, instanceId: string): void {
    const data = this.#store.value;
    const instances = data[extensionId]?.instances;
    if (!instances || !(instanceId in instances)) return;
    const nextInstances = { ...instances };
    delete nextInstances[instanceId];
    this.#store.set({
      ...data,
      [extensionId]: { ...data[extensionId], instances: nextInstances },
    });
  }
}
