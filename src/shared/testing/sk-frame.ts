import type { SKFrame } from '$shared/signalk';

// Test-only SKFrame builder with an advancing epoch, so consumers that dedupe work per fix by
// epoch (the anchor watch) see each frame as a new fix. Imported by *.test.ts files only.
export function createFrameFactory(start = 1000) {
  let epoch = start;
  return (self: Record<string, unknown>): SKFrame => {
    epoch += 1000;
    return {
      self: new Map(Object.entries(self)) as SKFrame['self'],
      connection: { phase: 'open', attempt: 0 },
      epoch,
    };
  };
}
