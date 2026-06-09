import { describe, expect, it } from 'vitest';
import { parseGpxRoutes } from './gpx-import';
import { routeToGpx } from './route-gpx';

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="OpenCPN" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>Bay &amp; "run"</name>
    <rtept lat="42.5" lon="-83.1"><name>Start</name></rtept>
    <rtept lat="42.6" lon="-83.2"/>
    <rtept lat="42.7" lon="-83.3"><name>End</name></rtept>
  </rte>
</gpx>`;

describe('parseGpxRoutes', () => {
  it('parses a GPX rte into a route with waypoints and unescaped names', () => {
    const routes = parseGpxRoutes(GPX);
    expect(routes).toHaveLength(1);
    expect(routes[0].name).toBe('Bay & "run"');
    expect(routes[0].waypoints).toHaveLength(3);
    expect(routes[0].waypoints[0]).toEqual({
      position: { latitude: 42.5, longitude: -83.1 },
      name: 'Start',
    });
    // A self-closing rtept with no name keeps its position and omits the name.
    expect(routes[0].waypoints[1]).toEqual({ position: { latitude: 42.6, longitude: -83.2 } });
  });

  it('round-trips a route through routeToGpx and back', () => {
    const route = {
      id: 'r1',
      name: 'Passage',
      waypoints: [
        { position: { latitude: 10, longitude: 20 }, name: 'A' },
        { position: { latitude: 11, longitude: 21 } },
      ],
    };
    const back = parseGpxRoutes(routeToGpx(route));
    expect(back).toHaveLength(1);
    expect(back[0].name).toBe('Passage');
    expect(back[0].waypoints[0]).toEqual({ position: { latitude: 10, longitude: 20 }, name: 'A' });
    // routeToGpx fills an unnamed waypoint with its 1-based index, so it round-trips as a name.
    expect(back[0].waypoints[1]).toEqual({ position: { latitude: 11, longitude: 21 }, name: '2' });
  });

  it('tolerates namespace prefixes and attribute order', () => {
    const ns = `<gpx:gpx><gpx:rte><gpx:name>NS</gpx:name>
      <gpx:rtept lon="5" lat="50"><gpx:name>P1</gpx:name></gpx:rtept>
      <gpx:rtept lat="51" lon="6"/></gpx:rte></gpx:gpx>`;
    const routes = parseGpxRoutes(ns);
    expect(routes).toHaveLength(1);
    expect(routes[0].name).toBe('NS');
    expect(routes[0].waypoints[0].position).toEqual({ latitude: 50, longitude: 5 });
  });

  it('drops routes with fewer than two valid points and names unnamed routes', () => {
    const sparse = `<gpx><rte><rtept lat="1" lon="1"/></rte>
      <rte><rtept lat="2" lon="2"/><rtept lat="3" lon="3"/></rte></gpx>`;
    const routes = parseGpxRoutes(sparse);
    expect(routes).toHaveLength(1);
    expect(routes[0].name).toBe('Imported route 1');
  });

  it('returns an empty array for non-route or malformed input', () => {
    expect(parseGpxRoutes('<gpx></gpx>')).toEqual([]);
    expect(parseGpxRoutes('not xml at all')).toEqual([]);
  });
});
