import { FrameBatcher } from './batcher';
import { SkConnection } from './connection';
import { reconcileDelta } from './reconcile';
import { SubscriptionRegistry } from './subscription-registry';
import {
  type ConnectionState,
  type Context,
  type Delta,
  INITIAL_CONNECTION_STATE,
  type Path,
  SELF_CONTEXT,
  type SKFrame,
  type SubscribeEntry,
} from './types';

// The hello handshake carries the self identifier; the rest of a frame is a Delta. Widen the parse
// to read that one optional field without a named one-field interface.
type DeltaOrHello = Delta & { self?: string };

export class WorkerCore {
  #connection?: SkConnection;
  #registry?: SubscriptionRegistry;
  #batcher = new FrameBatcher();
  #onFrame?: (frame: SKFrame) => void;
  #connectionState: ConnectionState = INITIAL_CONNECTION_STATE;
  #selfContext?: string;

  connect(url: string, onFrame: (frame: SKFrame) => void): void {
    this.#onFrame = onFrame;
    this.#connection = new SkConnection(url, {
      onState: (state) => {
        this.#connectionState = state;
      },
      onDelta: (raw) => this.#ingest(raw),
      onOpen: () => this.#registry?.resubscribeAll(),
    });
    this.#registry = new SubscriptionRegistry((message) => this.#connection?.send(message));
    this.#batcher.onFlush = (self, ais, epoch) => {
      this.#onFrame?.({ self, ais, connection: this.#connectionState, epoch });
    };
    this.#connection.connect();
  }

  subscribe(entries: SubscribeEntry[]): void {
    this.#registry?.add(entries);
  }

  unsubscribe(paths: Path[], context?: Context): void {
    this.#registry?.remove(paths, context);
  }

  // Send a client delta to the server. The connection drops the send when the socket is not
  // open. Unlike subscriptions, a published delta has no transport-level replay on reconnect,
  // so a delta sent mid-reconnect is lost until the producer next publishes a changed value.
  publish(delta: Delta): void {
    this.#connection?.send(delta);
  }

  disconnect(): void {
    this.#connection?.disconnect();
  }

  #isSelf(context: string): boolean {
    return context === SELF_CONTEXT || context === this.#selfContext;
  }

  #ingest(raw: string): void {
    let message: DeltaOrHello;
    try {
      message = JSON.parse(raw) as DeltaOrHello;
    } catch {
      // A malformed frame indicates a real server or transport fault. Log it in dev
      // and drop it: one bad frame must not tear down the stream.
      if (import.meta.env?.DEV) console.warn('[signalk] dropped a malformed delta frame');
      return;
    }
    if (!message.updates) {
      // The hello handshake carries the self identifier but no updates. A Signal K server always
      // sends hello first on /signalk/v1/stream, so #selfContext is set before any vessels.<self>
      // delta arrives. If that ordering were ever violated, a self delta would be misrouted into the
      // AIS bucket under its own urn and only cleared after the AIS TTL; we rely on the hello-first
      // contract rather than reconciling it.
      if (typeof message.self === 'string') this.#selfContext = message.self;
      return;
    }
    reconcileDelta(message, (write) => {
      if (this.#isSelf(write.context)) {
        this.#batcher.put(write.path, write.value);
      } else {
        this.#batcher.putVessel(write.context, write.path, write.value);
      }
    });
  }
}
