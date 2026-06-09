import type { Route, Waypoint } from '$entities/route';
import { uuidv4 } from '$shared/lib';

const XML_UNESCAPES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  quot: '"',
};

function unescapeXml(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|apos|quot);/g, (match, code) => {
    if (code[0] === '#') {
      const cp =
        code[1] === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
    }
    return XML_UNESCAPES[code] ?? match;
  });
}

// An optional namespace prefix (gpx:, ns3:, ...) precedes the element name in some exports.
const RTE = /<(?:\w+:)?rte\b[^>]*>([\s\S]*?)<\/(?:\w+:)?rte>/gi;
const RTEPT = /<(?:\w+:)?rtept\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?rtept>)/gi;
const NAME = /<(?:\w+:)?name\b[^>]*>([\s\S]*?)<\/(?:\w+:)?name>/i;
const LAT = /\blat\s*=\s*["']([^"']*)["']/i;
const LON = /\blon\s*=\s*["']([^"']*)["']/i;

function attrNumber(attrs: string, pattern: RegExp): number {
  const m = attrs.match(pattern);
  return m ? Number.parseFloat(m[1]) : Number.NaN;
}

function parseWaypoints(block: string): Waypoint[] {
  const waypoints: Waypoint[] = [];
  for (const pt of block.matchAll(RTEPT)) {
    const latitude = attrNumber(pt[1], LAT);
    const longitude = attrNumber(pt[1], LON);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      continue;
    }
    const nameMatch = pt[2]?.match(NAME);
    const name = nameMatch ? unescapeXml(nameMatch[1]).trim() : '';
    waypoints.push(
      name ? { position: { latitude, longitude }, name } : { position: { latitude, longitude } },
    );
  }
  return waypoints;
}

// Parse the <rte> elements of a GPX document into routes, the inverse of routeToGpx. Coordinates are
// WGS84 decimal degrees, so rtept lat/lon map straight to a waypoint position. Tolerant of namespace
// prefixes, attribute order, and self-closing rtepts; routes with fewer than two valid points are
// dropped. Returns an empty array when the text holds no usable route.
export function parseGpxRoutes(xml: string): Route[] {
  const routes: Route[] = [];
  for (const rte of xml.matchAll(RTE)) {
    const block = rte[1];
    const waypoints = parseWaypoints(block);
    if (waypoints.length < 2) continue;
    // The route name is the <name> before the first rtept, not a waypoint's name.
    const head = block.search(/<(?:\w+:)?rtept\b/i);
    const nameMatch = (head >= 0 ? block.slice(0, head) : block).match(NAME);
    const name = nameMatch ? unescapeXml(nameMatch[1]).trim() : '';
    routes.push({ id: uuidv4(), name: name || `Imported route ${routes.length + 1}`, waypoints });
  }
  return routes;
}
