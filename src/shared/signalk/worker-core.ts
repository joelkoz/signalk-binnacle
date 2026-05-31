import type { Context, Delta, Path } from '@signalk/server-api';
import { FrameBatcher } from './batcher';
import { SkConnection } from './connection';
import { reconcileDelta } from './reconcile';
import { SubscriptionRegistry } from './subscription-registry';
import type { ConnectionState, SKFrame, SubscribeEntry } from './types';

export class WorkerCore {
  #connection?: SkConnection;
  #registry?: SubscriptionRegistry;
  #batcher = new FrameBatcher();
  #onFrame?: (frame: SKFrame) => void;
  #connectionState: ConnectionState = { phase: 'connecting', attempt: 0, since: 0 };

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
    this.#batcher.onFlush = (self, epoch) => {
      this.#onFrame?.({ self, connection: this.#connectionState, epoch });
    };
    this.#connection.connect();
  }

  subscribe(entries: SubscribeEntry[]): void {
    this.#registry?.add(entries);
  }

  unsubscribe(paths: Path[], context?: Context): void {
    this.#connection?.send({
      context: context ?? ('vessels.self' as Context),
      unsubscribe: paths.map((path) => ({ path })),
    });
  }

  disconnect(): void {
    this.#connection?.disconnect();
  }

  #ingest(raw: string): void {
    let delta: Delta;
    try {
      delta = JSON.parse(raw) as Delta;
    } catch {
      return;
    }
    reconcileDelta(delta, (write) => this.#batcher.put(write.path, write.value));
  }
}
