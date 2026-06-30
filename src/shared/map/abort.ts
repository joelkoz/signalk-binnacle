// Whether an error is a fetch abort (the caller canceled, or the signal fired). Shared by the
// pmtiles network source (which must not retry aborts) and the block cache (which must rethrow
// them instead of serving a stale block as if the read succeeded).
export function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError');
}
