import { HOST_CAPABILITIES } from '$entities/plotter-ext';
import type { WidgetSize } from '$shared/signalk';

// Host identity sent in every handshake. hostVersion is informational; capabilities is the gate.
export const HOST_INFO = {
  host: 'binnacle',
  hostVersion: '1',
  apiVersion: '1',
  capabilities: [...HOST_CAPABILITIES],
};

// Manifest URLs are server-relative; resolve them against the Signal K server origin. Every URL,
// relative or absolute, is resolved through the URL parser against the server origin and accepted
// only when the result is same-origin: a faulty or hostile manifest must not load an off-origin
// page into the extension iframe, which runs with allow-same-origin and a live host bus under the
// user's session. Returns undefined for any off-origin or unparseable URL; callers skip rendering
// that contribution. Concatenating a raw string onto the origin would not catch a value like
// `evil.com/x` (no leading slash) or `//evil.com` resolving off-origin, so the parser does the work.
export function resolveExtUrl(origin: string, url: string): string | undefined {
  try {
    const serverOrigin = new URL(origin).origin;
    const resolved = new URL(url, serverOrigin);
    return resolved.origin === serverOrigin ? resolved.href : undefined;
  } catch {
    return undefined;
  }
}

const WIDGET_SPAN: Record<WidgetSize, [number, number]> = {
  '1x1': [1, 1],
  '2x1': [2, 1],
  '1x2': [1, 2],
  '2x2': [2, 2],
};

// A widget's grid footprint in columns and rows.
export function sizeToSpan(size: WidgetSize): [number, number] {
  return WIDGET_SPAN[size] ?? [1, 1];
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
