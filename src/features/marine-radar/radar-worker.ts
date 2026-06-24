import * as Comlink from 'comlink';
import { type RadarFrame, RadarFrameCore } from './radar-frame-core';
import type { RadarProvider } from './radar-types';
import type { RadarStreamStatus } from './radar-worker-client';

class RadarWorker {
  #socket: WebSocket | undefined;
  #timer = 0;

  #stopTimer(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = 0;
    }
  }

  #teardown(): void {
    this.#stopTimer();
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
    onStatus: (status: RadarStreamStatus) => void,
  ): Promise<void> {
    this.#teardown();
    const core = new RadarFrameCore(provider, spokesPerRev, maxSpokeLen);
    let hasData = false;
    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => onStatus('open');
    socket.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer)) {
        console.warn('[marine-radar] ignoring a non-binary stream message');
        return;
      }
      hasData = true;
      try {
        core.ingest(new Uint8Array(event.data));
      } catch (error) {
        // One malformed or truncated frame must not kill the stream: drop it and keep integrating.
        console.warn('[marine-radar] dropped a malformed radar frame', error);
      }
    };
    socket.onerror = () => onStatus('error');
    socket.onclose = () => {
      this.#stopTimer();
      onStatus('closed');
    };
    this.#socket = socket;
    // A worker-thread interval, never requestAnimationFrame, so a backgrounded tab keeps sweeping. The
    // flush is skipped until the first spoke message arrives, so an empty all-zero buffer never flips
    // the status to live.
    this.#timer = setInterval(
      () => {
        if (!hasData) return;
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
