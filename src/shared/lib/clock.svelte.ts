// A reactive wall clock that ticks on a fixed interval. Staleness checks compare now against the
// epoch of the last update, so they must re-evaluate even when no data is arriving: that is exactly
// when a stale fix has to be detected. A $derived comparing against a bare Date.now() would never
// re-run once the feed it watches stops, so it would never notice the feed stopping. This ticking
// source gives those deriveds a dependency that keeps advancing. Call dispose() to stop the timer.
export class Clock {
  now = $state(Date.now());

  #timer: ReturnType<typeof setInterval> | undefined;

  constructor(intervalMs = 1000) {
    if (typeof setInterval !== 'function') return;
    this.#timer = setInterval(() => {
      this.now = Date.now();
    }, intervalMs);
  }

  dispose(): void {
    if (this.#timer !== undefined) clearInterval(this.#timer);
    this.#timer = undefined;
  }
}
