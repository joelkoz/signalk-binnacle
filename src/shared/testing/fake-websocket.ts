// Test-only fake. Imported by *.test.ts files, never by production code.
export class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  sent: string[] = [];
  closed = false;
  // Sockets start CONNECTING; tests flip to OPEN (or call onopen, which sets it).
  readyState: number = FakeWebSocket.CONNECTING;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    // Mirror the browser: sending before the socket opens throws.
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.");
    }
    this.sent.push(data);
  }

  // Test helper: open the socket and fire onopen, like a real handshake.
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  close(): void {
    this.closed = true;
    // Mirror the browser: a closed socket reports CLOSED, so a send-after-close guard keyed on
    // readyState behaves in tests as it does in the browser.
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  static reset(): void {
    FakeWebSocket.instances = [];
  }
}
