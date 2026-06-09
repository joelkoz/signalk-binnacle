// Best-effort JSON fetch: centralizes the degrade-to-undefined, never-throw contract the free-API
// weather clients share, so a non-ok response, a transport failure, or a JSON parse error all yield
// undefined rather than propagating.
export async function fetchJsonOrUndefined<T>(
  url: string,
  init?: RequestInit,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<T | undefined> {
  try {
    const r = await fetchFn(url, init);
    if (!r.ok) return undefined;
    return (await r.json()) as T;
  } catch {
    return undefined;
  }
}
