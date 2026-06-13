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
  // dies silently: no frames, no connection deltas, and the UI looks identical to "still
  // connecting". Surface it in the console; connect() rejects so the caller can show an error.
  worker.onerror = (event) => {
    console.error('Signal K worker failed to load or threw', event.message ?? event);
  };
  worker.onmessageerror = (event) => {
    console.error('Signal K worker message could not be deserialized', event);
  };
  const raw = Comlink.wrap<SignalKClientApi>(worker);
  return {
    raw,
    async connect(url, onFrame) {
      await raw.connect(url, Comlink.proxy(onFrame));
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
