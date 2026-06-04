import { registerSW } from 'virtual:pwa-register';

export interface PwaController {
  update: () => void;
}

// Registers the service worker (prompt mode). onNeedRefresh fires when a new build is waiting so the
// UI can offer a reload, and update(true) activates it. On plain http (no secure context) registerSW
// no-ops, so this degrades cleanly. A registration error in a secure context is logged rather than
// swallowed, so a genuine HTTPS failure is observable instead of silently invisible.
export function registerPwa(onNeedRefresh?: () => void): PwaController {
  const updateSW = registerSW({
    onNeedRefresh: () => onNeedRefresh?.(),
    onRegisterError: (error) => console.warn('[pwa] service worker registration failed', error),
  });
  return { update: () => void updateSW(true) };
}
