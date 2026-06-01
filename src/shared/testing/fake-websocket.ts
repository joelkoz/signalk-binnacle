// Test-only fake. Imported by *.test.ts files, never by production code.
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  sent: string[] = [];
  closed = false;

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

  close(): void {
    this.closed = true;
    this.onclose?.();
  }

  static reset(): void {
    FakeWebSocket.instances = [];
  }
}
