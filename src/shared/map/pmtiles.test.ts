import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArchiveSource, NoStoreSource } from './pmtiles';
import { BlockCachedSource } from './pmtiles-block-cache';

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

  it('strips a weak ETag, which cannot validate range requests', async () => {
    const res = {
      status: 206,
      headers: new Headers({ ETag: 'W/"v1"' }),
      arrayBuffer: async () => new ArrayBuffer(4),
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));
    const out = await new NoStoreSource('http://x/a.pmtiles').getBytes(0, 4);
    expect(out.etag).toBeUndefined();
  });

  it('passes a strong ETag through for range validation', async () => {
    const res = {
      status: 206,
      headers: new Headers({ ETag: '"v1"' }),
      arrayBuffer: async () => new ArrayBuffer(4),
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));
    const out = await new NoStoreSource('http://x/a.pmtiles').getBytes(0, 4);
    expect(out.etag).toBe('"v1"');
  });
});

describe('createArchiveSource', () => {
  it('wraps a network archive in the block cache, keyed by the bare url', () => {
    const source = createArchiveSource('http://x/a.pmtiles');
    expect(source).toBeInstanceOf(BlockCachedSource);
    expect(source.getKey()).toBe('http://x/a.pmtiles');
  });

  it('leaves a blob: archive uncached, since its bytes are already local', () => {
    const source = createArchiveSource('blob:http://x/123');
    expect(source).toBeInstanceOf(NoStoreSource);
    expect(source.getKey()).toBe('blob:http://x/123');
  });
});
