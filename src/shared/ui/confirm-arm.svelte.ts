// A two-step armed confirm for a destructive one-tap strip action: the first tap arms, a second
// tap inside the window fires, and the arm times out back to safe, so a single mis-tap on a
// rolling deck can never execute.
const ARM_WINDOW_MS = 5_000;

export class ConfirmArm {
  #armed = $state(false);
  #timer: ReturnType<typeof setTimeout> | undefined;

  get armed(): boolean {
    return this.#armed;
  }

  // True when this tap is the confirming second tap and the action should fire.
  tap(): boolean {
    if (this.#armed) {
      this.disarm();
      return true;
    }
    this.#armed = true;
    this.#timer = setTimeout(() => {
      this.#armed = false;
      this.#timer = undefined;
    }, ARM_WINDOW_MS);
    return false;
  }

  disarm(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#armed = false;
  }
}
