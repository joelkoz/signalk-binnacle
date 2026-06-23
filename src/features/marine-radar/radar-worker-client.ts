import * as Comlink from 'comlink';
import type { RadarFrame } from './radar-frame-core';
import type { RadarProvider } from './radar-types';

export interface RadarWorkerApi {
  open(
    url: string,
    provider: RadarProvider,
    spokesPerRev: number,
    maxSpokeLen: number,
    flushHz: number,
    onFrame: (frame: RadarFrame) => void,
  ): Promise<void>;
  close(): Promise<void>;
}

export interface RadarWorkerClient {
  open(
    url: string,
    provider: RadarProvider,
    spokesPerRev: number,
    maxSpokeLen: number,
    flushHz: number,
    onFrame: (frame: RadarFrame) => void,
  ): Promise<void>;
  close(): Promise<void>;
  dispose(): void;
}

export function wrapRadarWorker(
  api: Comlink.Remote<RadarWorkerApi>,
  release: () => void,
  terminate: () => void,
): RadarWorkerClient {
  return {
    async open(url, provider, spokesPerRev, maxSpokeLen, flushHz, onFrame) {
      await api.open(url, provider, spokesPerRev, maxSpokeLen, flushHz, Comlink.proxy(onFrame));
    },
    async close() {
      await api.close();
    },
    dispose() {
      release();
      terminate();
    },
  };
}

export function createRadarWorkerClient(): RadarWorkerClient {
  const worker = new Worker(new URL('./radar-worker.ts', import.meta.url), { type: 'module' });
  worker.onerror = (event) => {
    console.error('Radar worker failed to load or threw', event.message ?? event);
  };
  const api = Comlink.wrap<RadarWorkerApi>(worker);
  return wrapRadarWorker(
    api,
    () => api[Comlink.releaseProxy](),
    () => worker.terminate(),
  );
}
