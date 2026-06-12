import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerDismiss } from './dialog';

// The node test environment has no window; stub one that records the shared keydown listener so
// synthetic Escape events can be driven through the stack.
type Handler = (event: KeyboardEvent) => void;
let handlers: Handler[] = [];

beforeEach(() => {
  handlers = [];
  vi.stubGlobal('window', {
    addEventListener: (_type: string, handler: Handler) => {
      handlers.push(handler);
    },
    removeEventListener: (_type: string, handler: Handler) => {
      handlers = handlers.filter((h) => h !== handler);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function escapeEvent(defaultPrevented = false): KeyboardEvent {
  return {
    key: 'Escape',
    defaultPrevented,
    preventDefault(): void {
      (this as { defaultPrevented: boolean }).defaultPrevented = true;
    },
  } as unknown as KeyboardEvent;
}

function fire(event: KeyboardEvent): void {
  for (const handler of [...handlers]) handler(event);
}

describe('registerDismiss', () => {
  it('closes only the topmost entry and marks the event consumed', () => {
    const closed: string[] = [];
    const offPanel = registerDismiss(() => closed.push('panel'));
    const offMenu = registerDismiss(() => closed.push('menu'));

    const first = escapeEvent();
    fire(first);
    expect(closed).toEqual(['menu']);
    expect(first.defaultPrevented).toBe(true);

    offMenu();
    const second = escapeEvent();
    fire(second);
    expect(closed).toEqual(['menu', 'panel']);
    expect(second.defaultPrevented).toBe(true);
    offPanel();
  });

  it('ignores an Escape another handler already consumed', () => {
    const closed: string[] = [];
    const off = registerDismiss(() => closed.push('panel'));
    fire(escapeEvent(true));
    expect(closed).toEqual([]);
    off();
  });

  it('ignores non-Escape keys and leaves them unconsumed', () => {
    const closed: string[] = [];
    const off = registerDismiss(() => closed.push('panel'));
    const event = {
      key: 'Tab',
      defaultPrevented: false,
      preventDefault(): void {
        (this as { defaultPrevented: boolean }).defaultPrevented = true;
      },
    } as unknown as KeyboardEvent;
    fire(event);
    expect(closed).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
    off();
  });

  it('attaches one window listener while entries exist and removes it when the stack empties', () => {
    const offA = registerDismiss(() => {});
    const offB = registerDismiss(() => {});
    expect(handlers).toHaveLength(1);
    offA();
    expect(handlers).toHaveLength(1);
    offB();
    expect(handlers).toHaveLength(0);
  });

  it('unregistering an entry below the top leaves the topmost in charge', () => {
    const closed: string[] = [];
    const offBottom = registerDismiss(() => closed.push('bottom'));
    const offTop = registerDismiss(() => closed.push('top'));
    offBottom();
    fire(escapeEvent());
    expect(closed).toEqual(['top']);
    offTop();
  });
});
