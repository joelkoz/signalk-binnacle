import { describe, expect, it } from 'vitest';
import { openIdbDatabase } from './idb';

interface FakeRequest {
  onupgradeneeded: (() => void) | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onblocked: (() => void) | null;
  result: IDBDatabase;
  error: DOMException | null;
}

// A factory whose first open is blocked (a second tab holds the prior version) and whose second open
// succeeds, so the test can prove the opener retries instead of reusing the rejected promise.
function blockedThenOpenFactory(): { factory: IDBFactory; attempts: () => number } {
  let attempts = 0;
  const factory = {
    open(): IDBOpenDBRequest {
      attempts += 1;
      const attempt = attempts;
      const req: FakeRequest = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
        result: { attempt } as unknown as IDBDatabase,
        error: null,
      };
      // Resolve the outcome after the synchronous handler wiring in the opener has run.
      queueMicrotask(() => {
        if (attempt === 1) req.onblocked?.();
        else req.onsuccess?.();
      });
      return req as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
  return { factory, attempts: () => attempts };
}

describe('openIdbDatabase', () => {
  it('retries the open after a rejection rather than reusing the failed promise', async () => {
    const { factory, attempts } = blockedThenOpenFactory();
    const open = openIdbDatabase(factory, 'binnacle-test', 1, () => {});

    await expect(open()).rejects.toThrow();
    // The memo cleared on rejection, so the next call opens afresh and resolves.
    const db = (await open()) as unknown as { attempt: number };
    expect(db.attempt).toBe(2);
    expect(attempts()).toBe(2);
  });

  it('memoizes a successful open and does not reopen', async () => {
    const { factory, attempts } = blockedThenOpenFactory();
    const open = openIdbDatabase(factory, 'binnacle-test', 1, () => {});
    await expect(open()).rejects.toThrow();
    await open();
    // A third call reuses the resolved connection without a new open.
    await open();
    expect(attempts()).toBe(2);
  });
});
