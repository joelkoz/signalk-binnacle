import { afterEach, describe, expect, it, vi } from 'vitest';
import { listResources, putSignalKPath } from './plotterext-relay';

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('putSignalKPath', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('PUTs to the v1 self path with dot-to-slash conversion and returns the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { state: 'COMPLETED' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await putSignalKPath('http://pi', 'tok', 'navigation.speedOverGround', 3.1);
    expect(result).toEqual({ state: 'COMPLETED' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://pi/signalk/v1/api/vessels/self/navigation/speedOverGround');
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ value: 3.1 });
  });

  it('encodes each path segment so a reserved character cannot break out of the path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await putSignalKPath('http://pi', undefined, 'electrical.batteries.house 1.voltage', 12);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://pi/signalk/v1/api/vessels/self/electrical/batteries/house%201/voltage',
    );
  });

  it('tolerates an empty body on a successful PUT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('no body');
        },
      } as unknown as Response),
    );
    expect(await putSignalKPath('http://pi', undefined, 'a.b', 1)).toEqual({});
  });

  it('rejects rather than reporting success when the server denies the PUT', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(403, { message: 'forbidden' })));
    await expect(
      putSignalKPath('http://pi', undefined, 'steering.autopilot.state', 'auto'),
    ).rejects.toThrow('403');
  });
});

describe('listResources', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the collection and returns its JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, { id1: { name: 'Cove' } })));
    expect(await listResources('http://pi', 'tok', 'notes')).toEqual({ id1: { name: 'Cove' } });
  });

  it('encodes the resource type and serializes query params, JSON-encoding non-strings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await listResources('http://pi', undefined, 'charts/extra', {
      radius: 5000,
      position: [44.1, -86.5],
    });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/signalk/v2/api/resources/charts%2Fextra?');
    expect(url).toContain('radius=5000');
    expect(url).toContain('position=');
  });

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(403, {})));
    await expect(listResources('http://pi', undefined, 'notes')).rejects.toThrow('403');
  });
});
