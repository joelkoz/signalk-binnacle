import * as Comlink from 'comlink';
import { type RadarFrame, RadarFrameCore } from './radar-frame-core';
import type { RadarProvider } from './radar-types';

class RadarWorker {
  #socket: WebSocket | undefined;
  #timer = 0;

  #teardown(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = 0;
    }
    this.#socket?.close();
    this.#socket = undefined;
  }

  async open(
    url: string,
    provider: RadarProvider,
    spokesPerRev: number,
    maxSpokeLen: number,
    flushHz: number,
    onFrame: (frame: RadarFrame) => void,
  ): Promise<void> {
    this.#teardown();
    const core = new RadarFrameCore(provider, spokesPerRev, maxSpokeLen);
    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) core.ingest(new Uint8Array(event.data));
    };
    this.#socket = socket;
    // A worker-thread interval, never requestAnimationFrame, so a backgrounded tab keeps sweeping.
    this.#timer = setInterval(
      () => {
        const frame = core.flush();
        onFrame(Comlink.transfer(frame, [frame.buffer]));
      },
      Math.round(1000 / flushHz),
    );
  }

  async close(): Promise<void> {
    this.#teardown();
  }
}

Comlink.expose(new RadarWorker());
