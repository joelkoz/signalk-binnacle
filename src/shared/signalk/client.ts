import * as Comlink from 'comlink';
import type { Delta, SignalKClientApi, SKFrame } from './types';

export interface SignalKClient {
  connect(url: string, onFrame: (frame: SKFrame) => void): Promise<void>;
  publish(delta: Delta): Promise<void>;
  reconnect(): Promise<void>;
  disconnect(): Promise<void>;
  raw: Comlink.Remote<SignalKClientApi>;
}

export function createSignalKClient(): SignalKClient {
  const worker = new Worker(new URL('./sk.worker.ts', import.meta.url), { type: 'module' });
  // A worker that fails to load (the "Class extends value undefined" trap, a chunk miss) otherwise
  // dies silently: the Comlink call to connect() never resolves or rejects, so the UI looks
  // identical to "still connecting". Capture the first load error and reject any in-flight connect()
  // with it, so the caller (App.svelte) surfaces the failure instead of latching on forever.
  let rejectPendingConnect: ((error: Error) => void) | undefined;
  worker.onerror = (event) => {
    const error = new Error(
      `Signal K worker failed to load or threw: ${event.message ?? 'unknown'}`,
    );
    console.error(error.message, event);
    rejectPendingConnect?.(error);
  };
  worker.onmessageerror = (event) => {
    console.error('Signal K worker message could not be deserialized', event);
  };
  const raw = Comlink.wrap<SignalKClientApi>(worker);
  return {
    raw,
    async connect(url, onFrame) {
      const workerFailed = new Promise<never>((_, reject) => {
        rejectPendingConnect = reject;
      });
      try {
        await Promise.race([raw.connect(url, Comlink.proxy(onFrame)), workerFailed]);
      } finally {
        rejectPendingConnect = undefined;
      }
    },
    async publish(delta) {
      await raw.publish(delta);
    },
    async reconnect() {
      await raw.reconnect();
    },
    async disconnect() {
      await raw.disconnect();
    },
  };
}
