import {
  fetchHistoryValuesAcrossProviders,
  HISTORY_RESOLUTION_SECONDS,
  HISTORY_WINDOW_SECONDS,
  type HistoryProviders,
  SK_PATHS,
} from '$shared/signalk';
import { type HistorySample, toSamples } from './time-travel-timeline';

export interface TimeTravelData {
  samples: HistorySample[];
  from: number;
  to: number;
}

// Position is sent bare: the server defaults it to the `first` aggregate and the provider reads a
// special position table, so a numeric aggregate suffix would 400. The metrics carry their methods.
const PATHS: readonly string[] = [
  SK_PATHS.position,
  `${SK_PATHS.depthBelowTransducer}:average`,
  `${SK_PATHS.windSpeedApparent}:max`,
  `${SK_PATHS.outsidePressure}:average`,
  `${SK_PATHS.speedOverGround}:average`,
];

interface Deps {
  fetchValues: typeof fetchHistoryValuesAcrossProviders;
}

export async function loadTimeTravelHistory(
  origin: string,
  token: string | undefined,
  providers: HistoryProviders,
  deps: Deps = { fetchValues: fetchHistoryValuesAcrossProviders },
): Promise<TimeTravelData | undefined> {
  const got = await deps.fetchValues(origin, token, providers, {
    paths: PATHS,
    durationSeconds: HISTORY_WINDOW_SECONDS,
    resolutionSeconds: HISTORY_RESOLUTION_SECONDS,
  });
  if (!got) return undefined;
  const samples = toSamples(got.values);
  const from = Date.parse(got.values.from);
  const to = Date.parse(got.values.to);
  return {
    samples,
    from: Number.isFinite(from) ? from : (samples[0]?.t ?? 0),
    to: Number.isFinite(to) ? to : (samples[samples.length - 1]?.t ?? 0),
  };
}
