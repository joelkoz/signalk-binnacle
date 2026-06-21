// The outcome of pickTextFile: the file text when one was read, or a reason the read did not produce
// text. A read error is reported distinctly from a cancel so a caller can tell the navigator "could
// not read that file" instead of silently doing nothing, which matters for flaky USB media on a boat.
export type PickedTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'cancel' | 'read-error' };

const CANCEL: PickedTextResult = { ok: false, reason: 'cancel' };

// Open the OS file picker for a single file and resolve its text. A transient input means a panel does
// not keep a hidden input element or re-implement the pick-the-same-file-twice reset. Shared by the
// Routes GPX import and the Profiles JSON import. The promise never rejects, so a caller that only
// guards the cancel path never sees an unhandled rejection; a failed read resolves ok:false instead.
export function pickTextFile(accept: string): Promise<PickedTextResult> {
  if (typeof document === 'undefined') return Promise.resolve(CANCEL);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('cancel', () => resolve(CANCEL), { once: true });
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(CANCEL);
          return;
        }
        resolve(
          file
            .text()
            .then((text) => ({ ok: true, text }) as const)
            .catch(() => ({ ok: false, reason: 'read-error' }) as const),
        );
      },
      { once: true },
    );
    input.click();
  });
}
