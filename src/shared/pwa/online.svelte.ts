// A reactive mirror of navigator.onLine, updated by the browser online/offline events.
// Call dispose() to remove the listeners when the owner is torn down.
export class OnlineStatus {
  online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);

  #cleanup: (() => void) | undefined;

  constructor() {
    if (typeof window === 'undefined') return;
    const setOnline = () => {
      this.online = true;
    };
    const setOffline = () => {
      this.online = false;
    };
    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);
    this.#cleanup = () => {
      window.removeEventListener('online', setOnline);
      window.removeEventListener('offline', setOffline);
    };
  }

  dispose(): void {
    this.#cleanup?.();
    this.#cleanup = undefined;
  }
}
