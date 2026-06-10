// Consecutive out-of-radius fixes required before the watch declares a drag. One stray fix is
// GPS scatter; three in a row (about three seconds at the 1 Hz position rate) is the boat moving.
const BREACH_FIXES = 3;

// Debounces the drag decision. update() is called once per position fix with whether that fix lies
// outside the watch radius; it returns true once enough consecutive fixes have breached. A fix back
// inside only resets the counter; latching the alarm is the store's job, so a boat that swings back
// inside cannot silently clear an alarm the navigator never saw.
export class DragDetector {
  #breaches = 0;

  update(outsideRadius: boolean): boolean {
    if (!outsideRadius) {
      this.#breaches = 0;
      return false;
    }
    this.#breaches += 1;
    return this.#breaches >= BREACH_FIXES;
  }

  reset(): void {
    this.#breaches = 0;
  }
}
