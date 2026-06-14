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

// Arrival latches with hysteresis: once inside the circle, the boat must move out past
// circle * this factor (or the active point must change) before arrived clears, so GPS jitter at
// the boundary cannot re-fire the arrival alarm and banner.
const ARRIVAL_EXIT_FACTOR = 1.2;

// Every course cell the guidance owns, so the pre-created, seeded, staleness-checked, and cleared
// sets provably match.
const COURSE_CELL_PATHS = [
  SK_PATHS.courseNextPoint,
  SK_PATHS.coursePreviousPoint,
  SK_PATHS.courseActiveRoute,
  SK_PATHS.courseCalcValues,
  SK_PATHS.courseArrivalCircle,
] as const;

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
    for (const path of COURSE_CELL_PATHS) store.cell(path);
  }

  // Seed every course cell from a one-time REST hydration, so the nav strip shows values immediately
  // before the stream sends the first change. asOf is the wall clock when the hydrate began; a slow
  // REST response must not clobber fresher streamed deltas (activate, then skip twice before the
  // hydrate resolves), so the seed is dropped when any course cell took a stream write at or after
  // that moment (each cell's epoch is the wall clock of its last stream write, zero until one lands).
  seed(
    info: CourseInfo | undefined,
    calc: CourseCalculations | undefined,
    asOf: number = Date.now(),
  ): void {
    // Per cell, not all-or-nothing: calcValues streams continuously, so a single calcValues delta
    // landing before a slow hydrate would otherwise drop the whole seed, including the info cells
    // (nextPoint, previousPoint, activeRoute, arrivalCircle) that only the REST read can supply
    // under subscribe=none. Each cell is seeded only when no stream write landed at or after the
    // hydrate began, so a fresh streamed value is never clobbered by the slower REST snapshot.
    const unstreamed = (path: string): boolean => this.#store.cell(path).epoch < asOf;
    if (info) {
      if (unstreamed(SK_PATHS.courseNextPoint)) {
        this.#store.cell(SK_PATHS.courseNextPoint).value = info.nextPoint;
      }
      if (unstreamed(SK_PATHS.coursePreviousPoint)) {
        this.#store.cell(SK_PATHS.coursePreviousPoint).value = info.previousPoint;
      }
      if (unstreamed(SK_PATHS.courseActiveRoute)) {
        this.#store.cell(SK_PATHS.courseActiveRoute).value = info.activeRoute;
      }
      if (unstreamed(SK_PATHS.courseArrivalCircle)) {
        this.#store.cell(SK_PATHS.courseArrivalCircle).value = info.arrivalCircle;
      }
    }
    if (calc && unstreamed(SK_PATHS.courseCalcValues)) {
      this.#store.cell(SK_PATHS.courseCalcValues).value = calc;
    }
  }

  // Clear every course cell on stop, so no previousPoint, activeRoute, arrivalCircle, or calcValues
  // lingers to leak into the next activation.
  clear(): void {
    for (const path of COURSE_CELL_PATHS) {
      this.#store.cell(path).value = undefined;
    }
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

  // The active destination position (the next point of the course or single-mark "go to"), for the
  // map to draw the destination marker and the vessel-to-destination course line. Undefined when no
  // course is active. Decimal degrees, like every position.
  get nextPosition(): LatLon | undefined {
    return this.#next;
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

  // Latch bookkeeping for the arrival hysteresis. Plain fields, not $state: they are internal to
  // the derived below (writing reactive state from inside a derived is unsafe), and the derived
  // already recomputes on every input that can change the latch.
  #arrivedLatched = false;
  #arrivalLatchKey: string | undefined;

  arrived: boolean = $derived.by(() => {
    const next = this.#next;
    const key = next ? `${next.latitude},${next.longitude}` : undefined;
    if (key !== this.#arrivalLatchKey) {
      this.#arrivalLatchKey = key;
      this.#arrivedLatched = false;
    }
    const d = this.distanceToNextMeters;
    if (key === undefined || d == null) {
      this.#arrivedLatched = false;
      return false;
    }
    const circle = this.#info.arrivalCircle ?? DEFAULT_ARRIVAL_CIRCLE_METERS;
    if (this.#arrivedLatched) {
      // Latched: only a clear move past the exit margin releases it, so jitter at the circle
      // boundary cannot re-fire the arrival alarm.
      if (d > circle * ARRIVAL_EXIT_FACTOR) this.#arrivedLatched = false;
    } else if (d <= circle) {
      this.#arrivedLatched = true;
    }
    return this.#arrivedLatched;
  });
}
