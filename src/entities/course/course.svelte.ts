import type { OwnVessel } from '$entities/vessel';
import type { LatLon } from '$shared/geo';
import {
  etaSeconds,
  rhumbBearingRad,
  rhumbCrossTrackErrorMeters,
  rhumbDistanceMeters,
  vmgMps,
} from '$shared/nav';
import type {
  ActiveRoute,
  CourseCalculations,
  CourseInfo,
  CoursePoint,
  SignalKStore,
} from '$shared/signalk';
import { SK_PATHS } from '$shared/signalk';

export type CourseSource = 'server' | 'computed';

// Arrival radius used when the server reports no arrivalCircle for the active leg.
const DEFAULT_ARRIVAL_CIRCLE_METERS = 100;

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

  // Seed every course cell from a one-time REST hydration, so the nav strip shows values immediately
  // before the stream sends the first change. The guidance owns these cells, so the seeded set and
  // the cleared set provably match.
  seed(info: CourseInfo | undefined, calc: CourseCalculations | undefined): void {
    if (info) {
      this.#store.cell(SK_PATHS.courseNextPoint).value = info.nextPoint;
      this.#store.cell(SK_PATHS.coursePreviousPoint).value = info.previousPoint;
      this.#store.cell(SK_PATHS.courseActiveRoute).value = info.activeRoute;
      this.#store.cell(SK_PATHS.courseArrivalCircle).value = info.arrivalCircle;
    }
    if (calc) this.#store.cell(SK_PATHS.courseCalcValues).value = calc;
  }

  // Clear every course cell on stop, so no previousPoint, activeRoute, arrivalCircle, or calcValues
  // lingers to leak into the next activation.
  clear(): void {
    this.#store.cell(SK_PATHS.courseNextPoint).value = undefined;
    this.#store.cell(SK_PATHS.coursePreviousPoint).value = undefined;
    this.#store.cell(SK_PATHS.courseActiveRoute).value = undefined;
    this.#store.cell(SK_PATHS.courseArrivalCircle).value = undefined;
    this.#store.cell(SK_PATHS.courseCalcValues).value = undefined;
  }

  #info = $derived.by<CourseInfo>(() => ({
    nextPoint: this.#store.cell(SK_PATHS.courseNextPoint).value as CoursePoint | undefined,
    previousPoint: this.#store.cell(SK_PATHS.coursePreviousPoint).value as CoursePoint | undefined,
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

  // The active route's destination index and total point count, when a route (not a single "go to")
  // is active, so a consumer can sum the legs still ahead for a whole-route distance and ETA.
  get activePointIndex(): number | undefined {
    return this.#info.activeRoute?.pointIndex ?? undefined;
  }

  get activePointTotal(): number | undefined {
    return this.#info.activeRoute?.pointTotal ?? undefined;
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

  // The server's estimated time of arrival as an ISO-8601 instant, preferred over a client clock
  // estimate when a provider populates calcValues. Only meaningful when source is 'server'; when the
  // values are computed client-side it is undefined and the consumer falls back to now plus its own
  // time-to-go.
  get estimatedTimeOfArrivalIso(): string | undefined {
    return this.#calc?.estimatedTimeOfArrival ?? undefined;
  }

  get #next(): LatLon | undefined {
    return this.#info.nextPoint?.position;
  }

  // The vessel position only while the fix is fresh. A stale fix must not feed the computed-fallback
  // geodesy, or DTW, BTW, XTE, and VMG would keep ticking off a frozen position. The server's own
  // calcValues, when present, are the server's responsibility and pass through untouched.
  get #freshPos(): LatLon | undefined {
    return this.#vessel.positionStale ? undefined : this.#vessel.position;
  }

  // The leg origin: the server's previousPoint when present, else the vessel's own position so a
  // single-mark "go to" with no leg origin still yields a sensible cross-track baseline.
  get #prev(): LatLon | undefined {
    return this.#info.previousPoint?.position ?? this.#freshPos;
  }

  // The active-leg readouts are $derived so each leg's geodesy is computed once per dependency
  // change and shared across readers, not recomputed on every access. Several consumers read more
  // than one (the nav strip reads cross-track twice, time-to-go reads distance, the arrival effect
  // reads arrived which reads distance), so without memoization the same rhumb distance and
  // cross-track ran two or three times per render in the computed-fallback path.
  distanceToNextMeters: number | undefined = $derived.by(() => {
    if (this.#calc?.distance != null) return this.#calc.distance;
    const pos = this.#freshPos;
    return pos && this.#next ? rhumbDistanceMeters(pos, this.#next) : undefined;
  });

  bearingToNextRad: number | undefined = $derived.by(() => {
    if (this.#calc?.bearingTrue != null) return this.#calc.bearingTrue;
    const pos = this.#freshPos;
    return pos && this.#next ? rhumbBearingRad(pos, this.#next) : undefined;
  });

  crossTrackErrorMeters: number | undefined = $derived.by(() => {
    if (this.#calc?.crossTrackError != null) return this.#calc.crossTrackError;
    const pos = this.#freshPos;
    return pos && this.#prev && this.#next
      ? rhumbCrossTrackErrorMeters(this.#prev, this.#next, pos)
      : undefined;
  });

  velocityMadeGoodMps: number | undefined = $derived.by(() => {
    if (this.#calc?.velocityMadeGood != null) return this.#calc.velocityMadeGood;
    const pos = this.#freshPos;
    const sog = this.#vessel.sogMps;
    const cog = this.#vessel.cogRad;
    return pos && this.#next && sog != null && cog != null
      ? vmgMps(pos, this.#next, sog, cog)
      : undefined;
  });

  timeToGoSeconds: number | undefined = $derived.by(() => {
    if (this.#calc?.timeToGo != null) return this.#calc.timeToGo;
    const d = this.distanceToNextMeters;
    const sog = this.#vessel.sogMps;
    return d != null && sog != null ? etaSeconds(d, sog) : undefined;
  });

  arrived: boolean = $derived.by(() => {
    const d = this.distanceToNextMeters;
    const circle = this.#info.arrivalCircle ?? DEFAULT_ARRIVAL_CIRCLE_METERS;
    return d != null && d <= circle;
  });
}
