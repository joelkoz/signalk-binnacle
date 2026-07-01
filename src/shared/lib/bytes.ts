const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

// Humanize a byte count to a rounded value and unit label, split so a caller can render the value and
// unit in separate type tiers (the regions panel stat grid, the offline-charts status chip). Binary
// magnitudes with the conventional short labels; the display edge for the SI byte counts the container
// reports.
export function formatBytes(bytes: number): { value: string; unit: string } {
  if (bytes >= GB) return { value: (bytes / GB).toFixed(2), unit: 'GB' };
  if (bytes >= MB) return { value: (bytes / MB).toFixed(1), unit: 'MB' };
  if (bytes >= KB) return { value: (bytes / KB).toFixed(1), unit: 'KB' };
  return { value: String(Math.round(bytes)), unit: 'B' };
}
