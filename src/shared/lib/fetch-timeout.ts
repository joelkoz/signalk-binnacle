// A server that accepts the TCP connection but never responds (a half-open link on a boat, a stalled
// proxy) would otherwise hang a fetch for the browser default, which can be minutes. Wrapping the
// request init with a timeout AbortSignal bounds that wait. An init that already carries a signal is
// left untouched (the caller owns cancellation), and an environment without AbortSignal.timeout
// degrades to no timeout rather than throwing.
export const DEFAULT_FETCH_TIMEOUT_MS = 8000;

export function withTimeout(
  init?: RequestInit,
  ms: number = DEFAULT_FETCH_TIMEOUT_MS,
): RequestInit {
  if (init?.signal) return init;
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    return init ?? {};
  }
  return { ...init, signal: AbortSignal.timeout(ms) };
}
