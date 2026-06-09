import type { Route } from '$entities/route';
import { downloadText } from '$shared/lib';
import { escapeXml } from './xml-entities';

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

// Trigger a browser download of the route as a .gpx file, matching the track GeoJSON export.
export function downloadRouteGpx(route: Route): void {
  downloadText(`${route.name || 'route'}.gpx`, routeToGpx(route), 'application/gpx+xml');
}
