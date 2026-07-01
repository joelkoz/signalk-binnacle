// Tracks which saved-list row currently has its inline delete confirm open, so only one row is armed
// at a time: arming a second row replaces the first. A destructive per-row action (delete a saved
// route or track) arms the row on the first tap, then confirm() clears the arm and runs the action,
// or cancel() dismisses it. Distinct from ConfirmArm, which is the single, time-windowed arm for a
// one-tap strip action.
export class ArmedRow {
  #id = $state<string | undefined>();
  readonly #run: (id: string) => void;

  constructor(run: (id: string) => void) {
    this.#run = run;
  }

  isArmed(id: string): boolean {
    return this.#id === id;
  }

  arm(id: string): void {
    this.#id = id;
  }

  cancel(): void {
    this.#id = undefined;
  }

  confirm(id: string): void {
    this.#id = undefined;
    this.#run(id);
  }
}
