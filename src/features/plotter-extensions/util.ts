import { HOST_CAPABILITIES } from '$entities/plotter-ext';
import type { WidgetSize } from '$shared/signalk';

// Host identity sent in every handshake. hostVersion is informational; capabilities is the gate.
export const HOST_INFO = {
  host: 'binnacle',
  hostVersion: '1',
  apiVersion: '1',
  capabilities: [...HOST_CAPABILITIES],
};

// Manifest URLs are server-relative; resolve them against the Signal K server origin. An absolute
// URL passes through unchanged.
export function resolveExtUrl(origin: string, url: string): string {
  return /^https?:/.test(url) ? url : `${origin}${url}`;
}

// A widget's grid footprint in columns and rows.
export function sizeToSpan(size: WidgetSize): [number, number] {
  const [cols, rows] = size.split('x').map((n) => Number.parseInt(n, 10));
  return [cols || 1, rows || 1];
}

// The host's widget anchor areas. Top-left is reserved for Binnacle's own chrome, so it is not
// offered. Per-area grid dimensions and packing live in placement.ts (AREA_GRID).
export interface WidgetArea {
  id: string;
  label: string;
}

export const WIDGET_AREAS: readonly WidgetArea[] = [
  { id: 'top-center', label: 'Top center' },
  { id: 'top-right', label: 'Top right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'bottom-center', label: 'Bottom center' },
  { id: 'bottom-right', label: 'Bottom right' },
];
