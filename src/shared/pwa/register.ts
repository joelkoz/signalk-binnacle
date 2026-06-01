import { registerSW } from 'virtual:pwa-register';

export interface PwaController {
  update: () => void;
}

// Registers the service worker. autoUpdate installs the new worker in the background;
// onNeedRefresh fires when a new build is waiting so the UI can offer a reload, and
// update(true) activates it.
export function registerPwa(onNeedRefresh?: () => void): PwaController {
  const updateSW = registerSW({
    onNeedRefresh: () => onNeedRefresh?.(),
  });
  return { update: () => void updateSW(true) };
}
