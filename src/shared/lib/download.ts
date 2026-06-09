// Trigger a browser download of a blob as a named file. Node-guarded so it is inert in tests and any
// non-DOM context. Shared by the track GeoJSON export and the route GPX export.
export function downloadBlob(filename: string, blob: Blob): void {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
