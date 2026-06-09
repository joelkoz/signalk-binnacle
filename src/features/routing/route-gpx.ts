import type { Route } from '$entities/route';

const XML_ESCAPES: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
};

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => XML_ESCAPES[c] ?? c);
}

// Serialize a route as a GPX 1.1 <rte>, the interchange format every other plotter, MFD, and
// Freeboard-SK reads. Per-waypoint names ride in <rtept><name>, falling back to the 1-based index.
export function routeToGpx(route: Route): string {
  const points = route.waypoints
    .map((w, i) => {
      const name = escapeXml(w.name ?? `${i + 1}`);
      return `    <rtept lat="${w.position.latitude}" lon="${w.position.longitude}"><name>${name}</name></rtept>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Binnacle" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>${escapeXml(route.name)}</name>
${points}
  </rte>
</gpx>
`;
}

// Trigger a browser download of the route as a .gpx file. Node-guarded so it is inert in tests and
// any non-DOM context, matching the track GeoJSON export.
export function downloadRouteGpx(route: Route): void {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return;
  const blob = new Blob([routeToGpx(route)], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${route.name || 'route'}.gpx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
