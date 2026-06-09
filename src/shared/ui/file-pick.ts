// Open the OS file picker for a single file and resolve its text, or undefined when the user cancels or
// when run outside a browser. A transient input means a panel does not keep a hidden input element or
// re-implement the pick-the-same-file-twice reset. Shared by the Routes GPX import and the Profiles
// JSON import. resolve(file.text()) adopts the read promise, so the result is the file's text.
export function pickTextFile(accept: string): Promise<string | undefined> {
  if (typeof document === 'undefined') return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('cancel', () => resolve(undefined), { once: true });
    input.addEventListener('change', () => resolve(input.files?.[0]?.text() ?? undefined), {
      once: true,
    });
    input.click();
  });
}
