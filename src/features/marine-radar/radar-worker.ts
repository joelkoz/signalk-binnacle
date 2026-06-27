import * as Comlink from 'comlink';
import { type RadarFrame, RadarFrameCore } from './radar-frame-core';
import type { RadarStreamStatus } from './radar-worker-client';

type Releasable = { [Comlink.releaseProxy]?: () => void };

class RadarWorker {
  #socket: WebSocket | undefined;
  #timer = 0;
  // The Comlink callback proxies for the current open(), released on the next open() or on close() so
  // their MessagePorts do not accumulate across radar switches.
  #callbacks: Releasable[] = [];

  #stopTimer(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = 0;
    }
  }

  #teardown(): void {
    this.#stopTimer();
    if (this.#socket) {
      // Detach the handlers before closing so an intentional teardown (a new open() or a close()) does
      // not fire onStatus('closed'), which the controller would map to an error and flash on the panel.
      this.#socket.onopen = null;
      this.#socket.onmessage = null;
      this.#socket.onerror = null;
      this.#socket.onclose = null;
      this.#socket.close();
      this.#socket = undefined;
    }
    for (const cb of this.#callbacks) cb[Comlink.releaseProxy]?.();
    this.#callbacks = [];
  }

  async open(
    url: string,
    spokesPerRev: number,
    maxSpokeLen: number,
    initialRange: number,
    flushHz: number,
    onFrame: (frame: RadarFrame) => void,
    onStatus: (status: RadarStreamStatus) => void,
  ): Promise<void> {
    this.#teardown();
    this.#callbacks = [onFrame as Releasable, onStatus as Releasable];
    const core = new RadarFrameCore(spokesPerRev, maxSpokeLen, initialRange);
    let hasData = false;
    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => onStatus('open');
    socket.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer)) {
        console.warn('[marine-radar] ignoring a non-binary stream message');
        return;
      }
      try {
        // hasData flips only once a message actually decodes to >= 1 spoke, so a stream of undecodable
        // or empty messages never starts flushing and the controller never reports a false "live".
        if (core.ingest(new Uint8Array(event.data)) > 0) hasData = true;
      } catch (error) {
        // One malformed or truncated frame must not kill the stream: drop it and keep integrating.
        console.warn('[marine-radar] dropped a malformed radar frame', error);
      }
    };
    socket.onerror = (event) => {
      console.warn('[marine-radar] spokes WebSocket error', event);
      onStatus('error');
    };
    socket.onclose = () => {
      this.#stopTimer();
      onStatus('closed');
    };
    this.#socket = socket;
    // A worker-thread interval, never requestAnimationFrame, so a backgrounded tab keeps sweeping. The
    // flush is skipped until the first message decodes to a real spoke; each flushed frame carries the
    // spoke count since the last flush so the controller can tell painting from connected-but-no-data.
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
