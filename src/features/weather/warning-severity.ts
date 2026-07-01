import type { WeatherWarning } from './signalk-weather';

// Severity order for the warnings list: the gale must never sit under a marginal advisory.
const WARN_HURRICANE = /hurricane|typhoon/;
const WARN_STORM = /\bstorm warning\b|\btropical storm\b/;
const WARN_GALE = /gale/;
const WARN_SMALL_CRAFT = /small craft/;

function severityRank(type: string): number {
  const t = type.toLowerCase();
  if (WARN_HURRICANE.test(t)) return 0;
  if (WARN_STORM.test(t)) return 1;
  if (WARN_GALE.test(t)) return 2;
  if (WARN_SMALL_CRAFT.test(t)) return 3;
  return 4;
}

// Highest-severity first, without mutating the input list.
export function sortWarnings(warnings: WeatherWarning[]): WeatherWarning[] {
  return warnings.slice().sort((a, b) => severityRank(a.type) - severityRank(b.type));
}
