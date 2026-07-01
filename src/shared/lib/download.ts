// Trigger a browser download of a blob as a named file. Node-guarded so it is inert in tests and any
// non-DOM context. Shared by the track GeoJSON export and the route GPX export.
function downloadBlob(filename: string, blob: Blob): void {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoke on the next tick, not synchronously: some browsers cancel an in-flight download if the
  // object URL is revoked before the navigation to it has committed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Trigger a browser download of serialized text (GPX, GeoJSON, JSON) as a named file with the given
// MIME type. Wraps the Blob construction every text exporter repeated, so the type and filename live in
// one call. Inert outside a DOM context, via downloadBlob.
export function downloadText(filename: string, text: string, type: string): void {
  downloadBlob(filename, new Blob([text], { type }));
}
