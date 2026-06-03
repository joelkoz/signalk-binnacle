// Human-friendly byte size for storage readouts (the chart detail, and any future use).
export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes < 0) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${Math.round(mb)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
