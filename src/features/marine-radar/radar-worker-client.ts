import * as Comlink from 'comlink';
import type { RadarFrame } from './radar-frame-core';

// The radar stream's connection state, surfaced from the worker so the controller can reflect it in
// the store: 'open' means the socket connected (awaiting the first spoke), 'closed' and 'error' mean
// the stream dropped or failed.
export type RadarStreamStatus = 'open' | 'error' | 'closed';

export interface RadarWorkerApi {
  open(
    url: string,
    spokesPerRev: number,
    maxSpokeLen: number,
    flushHz: number,
    onFrame: (frame: RadarFrame) => void,
    onStatus: (status: RadarStreamStatus) => void,
  ): Promise<void>;
  close(): Promise<void>;
}

export interface RadarWorkerClient {
  open(
    url: string,
    spokesPerRev: number,
    maxSpokeLen: number,
    flushHz: number,
    onFrame: (frame: RadarFrame) => void,
    onStatus: (status: RadarStreamStatus) => void,
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
    async open(url, spokesPerRev, maxSpokeLen, flushHz, onFrame, onStatus) {
      await api.open(
        url,
        spokesPerRev,
        maxSpokeLen,
        flushHz,
        Comlink.proxy(onFrame),
        Comlink.proxy(onStatus),
      );
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
    // A worker that fails to load often has an empty message; the filename and line locate it.
    console.error('Radar worker failed to load or threw', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
    });
  };
  const api = Comlink.wrap<RadarWorkerApi>(worker);
  return wrapRadarWorker(
    api,
    () => api[Comlink.releaseProxy](),
    () => worker.terminate(),
  );
}
