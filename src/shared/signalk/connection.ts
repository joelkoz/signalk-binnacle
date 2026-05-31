import { fullJitterDelay } from './backoff';
import type { ConnectionPhase, ConnectionState } from './types';

interface ConnectionHandlers {
  onState: (state: ConnectionState) => void;
  onDelta: (raw: string) => void;
  onOpen?: () => void;
}

function withQuery(url: string, query: string): string {
  return url.includes('?') ? `${url}&${query}` : `${url}?${query}`;
}

export class SkConnection {
  #url: string;
  #handlers: ConnectionHandlers;
  #ws?: WebSocket;
  #attempt = 0;
  #stopped = false;
  #reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor(url: string, handlers: ConnectionHandlers) {
    this.#url = url;
    this.#handlers = handlers;
  }

  connect(): void {
    this.#stopped = false;
    this.#emit('connecting');
    const ws = new WebSocket(withQuery(this.#url, 'subscribe=none'));
    this.#ws = ws;
    ws.onopen = () => {
      this.#attempt = 0;
      this.#emit('open');
      this.#handlers.onOpen?.();
    };
    ws.onmessage = (event: MessageEvent) => this.#handlers.onDelta(event.data as string);
    ws.onclose = () => {
      if (this.#stopped) return;
      this.#scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  send(message: unknown): void {
    this.#ws?.send(JSON.stringify(message));
  }

  disconnect(): void {
    this.#stopped = true;
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#ws?.close();
    this.#emit('closed');
  }

  #scheduleReconnect(): void {
    this.#emit('reconnecting');
    const delay = fullJitterDelay(this.#attempt);
    this.#attempt += 1;
    this.#reconnectTimer = setTimeout(() => {
      if (!this.#stopped) this.connect();
    }, delay);
  }

  #emit(phase: ConnectionPhase): void {
    this.#handlers.onState({ phase, attempt: this.#attempt, since: 0 });
  }
}
