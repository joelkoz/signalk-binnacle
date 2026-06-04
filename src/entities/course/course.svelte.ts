import type { OwnVessel } from '$entities/vessel';
import {
  crossTrackErrorMeters,
  etaSeconds,
  rhumbBearingRad,
  rhumbDistanceMeters,
  vmgMps,
} from '$shared/nav';
import type {
  ActiveRoute,
  CourseCalculations,
  CourseInfo,
  LatLon,
  SignalKStore,
} from '$shared/signalk';
import { SK_PATHS } from '$shared/signalk';

export type CourseSource = 'server' | 'computed';

// Source-agnostic active-following guidance. It reads the Signal K navigation.course paths from
// the store and exposes the active-leg readouts, preferring the server's calcValues when a
// provider populates them and computing the derived values client-side when they are absent or
// null. All values are SI (meters, radians, m/s, seconds); positions are decimal degrees.
export class CourseGuidance {
  #store: SignalKStore;
  #vessel: OwnVessel;

  constructor(store: SignalKStore, vessel: OwnVessel) {
    this.#store = store;
    this.#vessel = vessel;
    // Pre-create the cells so the first access inside a reactive context finds an existing,
    // tracked cell. A cell created lazily during a reactive read is not tracked, so later
    // updates would not re-render. This mirrors OwnVessel's constructor.
    store.cell(SK_PATHS.courseNextPoint);
    store.cell(SK_PATHS.coursePreviousPoint);
    store.cell(SK_PATHS.courseActiveRoute);
    store.cell(SK_PATHS.courseCalcValues);
    store.cell(SK_PATHS.courseArrivalCircle);
  }

  #info = $derived.by<CourseInfo>(() => ({
    nextPoint: this.#store.cell(SK_PATHS.courseNextPoint).value as CourseInfo['nextPoint'],
    previousPoint: this.#store.cell(SK_PATHS.coursePreviousPoint)
      .value as CourseInfo['previousPoint'],
    activeRoute: this.#store.cell(SK_PATHS.courseActiveRoute).value as ActiveRoute | undefined,
    arrivalCircle: this.#store.cell(SK_PATHS.courseArrivalCircle).value as number | undefined,
  }));

  #calc = $derived.by(
    () => this.#store.cell(SK_PATHS.courseCalcValues).value as CourseCalculations | undefined,
  );

  get active(): boolean {
    return !!this.#info.nextPoint?.position;
  }

  // True when the active point is the last in the route, so the arrival advance does not step past
  // the end. Conservative: false when the route extent is unknown.
  get isLastPoint(): boolean {
    const route = this.#info.activeRoute;
    if (route?.pointIndex == null || route?.pointTotal == null) return false;
    return route.pointIndex >= route.pointTotal - 1;
  }

  // 'server' when the provider supplied a usable cross-track error, otherwise 'computed'. The
  // cross-track error is the marker calcValue: a provider that publishes calcValues at all
  // publishes it, so its presence is the cleanest single test for a populated calcValues block.
  get source(): CourseSource {
    return this.#calc && this.#calc.crossTrackError != null ? 'server' : 'computed';
  }

  get nextPointName(): string | undefined {
    return this.#info.nextPoint?.name;
  }

  get #next(): LatLon | undefined {
    return this.#info.nextPoint?.position;
  }

  // The leg origin: the server's previousPoint when present, else the vessel's own position so a
  // single-mark "go to" with no leg origin still yields a sensible cross-track baseline.
  get #prev(): LatLon | undefined {
    return this.#info.previousPoint?.position ?? this.#vessel.position;
  }

  get distanceToNextMeters(): number | undefined {
    if (this.#calc?.distance != null) return this.#calc.distance;
    const pos = this.#vessel.position;
    return pos && this.#next ? rhumbDistanceMeters(pos, this.#next) : undefined;
  }

  get bearingToNextRad(): number | undefined {
    if (this.#calc?.bearingTrue != null) return this.#calc.bearingTrue;
    const pos = this.#vessel.position;
    return pos && this.#next ? rhumbBearingRad(pos, this.#next) : undefined;
  }

  get crossTrackErrorMeters(): number | undefined {
    if (this.#calc?.crossTrackError != null) return this.#calc.crossTrackError;
    const pos = this.#vessel.position;
    return pos && this.#prev && this.#next
      ? crossTrackErrorMeters(this.#prev, this.#next, pos)
      : undefined;
  }

  get velocityMadeGoodMps(): number | undefined {
    if (this.#calc?.velocityMadeGood != null) return this.#calc.velocityMadeGood;
    const pos = this.#vessel.position;
    const sog = this.#vessel.sogMps;
    const cog = this.#vessel.cogRad;
    return pos && this.#next && sog != null && cog != null
      ? vmgMps(pos, this.#next, sog, cog)
      : undefined;
  }

  get timeToGoSeconds(): number | undefined {
    if (this.#calc?.timeToGo != null) return this.#calc.timeToGo;
    const d = this.distanceToNextMeters;
    const sog = this.#vessel.sogMps;
    return d != null && sog != null ? etaSeconds(d, sog) : undefined;
  }

  get arrived(): boolean {
    const d = this.distanceToNextMeters;
    const circle = this.#info.arrivalCircle ?? 100;
    return d != null && d <= circle;
  }
}
