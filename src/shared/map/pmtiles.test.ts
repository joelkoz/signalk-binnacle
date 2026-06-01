import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoStoreSource } from './pmtiles';

function response(status: number, bytes = 4): Response {
  return {
    status,
    headers: new Headers(),
    arrayBuffer: async () => new ArrayBuffer(bytes),
  } as unknown as Response;
}

describe('NoStoreSource.getBytes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retries a transient network error then resolves', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(response(206));
    vi.stubGlobal('fetch', fetchMock);
    const out = await new NoStoreSource('http://x/a.pmtiles').getBytes(0, 4);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.data.byteLength).toBe(4);
  });

  it('retries a 5xx then resolves', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(206));
    vi.stubGlobal('fetch', fetchMock);
    const out = await new NoStoreSource('http://x/a.pmtiles').getBytes(0, 4);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.data.byteLength).toBe(4);
  });

  it('does not retry a 4xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(404));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new NoStoreSource('http://x/a.pmtiles').getBytes(0, 4)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a caller abort', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      new NoStoreSource('http://x/a.pmtiles').getBytes(0, 4, controller.signal),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retry budget', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new NoStoreSource('http://x/a.pmtiles').getBytes(0, 4)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
