import type { LatLon } from '$shared/geo';
import { haversineMeters, rhumbBearingRad } from '$shared/nav';

export interface MeasureLeg {
  from: LatLon;
  to: LatLon;
  distanceMeters: number;
  bearingRad: number;
}

// The measure tool's state: an armed flag and the tapped points. Legs and the running total are
// derived, so the strip and the overlay read one source. Transient by design: nothing persists,
// and stopping the tool clears the points.
export class MeasureStore {
  #active = $state(false);
  #points = $state<LatLon[]>([]);

  get active(): boolean {
    return this.#active;
  }

  get points(): readonly LatLon[] {
    return this.#points;
  }

  legs = $derived.by<MeasureLeg[]>(() => {
    const out: MeasureLeg[] = [];
    for (let i = 1; i < this.#points.length; i += 1) {
      const from = this.#points[i - 1];
      const to = this.#points[i];
      out.push({
        from,
        to,
        distanceMeters: haversineMeters(from.latitude, from.longitude, to.latitude, to.longitude),
        bearingRad: rhumbBearingRad(from, to),
      });
    }
    return out;
  });

  get lastLeg(): MeasureLeg | undefined {
    return this.legs[this.legs.length - 1];
  }

  #total = $derived.by<number>(() => {
    let total = 0;
    for (const leg of this.legs) total += leg.distanceMeters;
    return total;
  });

  get totalMeters(): number {
    return this.#total;
  }

  // Arm the tool with a clean slate; chart taps then append points.
  start(): void {
    this.#points = [];
    this.#active = true;
  }

  stop(): void {
    this.#active = false;
    this.#points = [];
  }

  add(point: LatLon): void {
    if (!this.#active) return;
    this.#points = [...this.#points, point];
  }

  undo(): void {
    this.#points = this.#points.slice(0, -1);
  }

  clear(): void {
    this.#points = [];
  }
}
