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
// URL is accepted only when its origin matches the server origin: a faulty or hostile manifest must
// not load an off-origin page into the extension iframe, which runs with allow-same-origin and a
// live host bus under the user's session. Returns undefined for any off-origin or unparseable URL;
// callers skip rendering that contribution. A relative URL is always same-origin and is resolved.
export function resolveExtUrl(origin: string, url: string): string | undefined {
  if (/^https?:/i.test(url)) {
    try {
      const serverOrigin = new URL(origin).origin;
      return new URL(url).origin === serverOrigin ? url : undefined;
    } catch {
      return undefined;
    }
  }
  return `${origin}${url}`;
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
