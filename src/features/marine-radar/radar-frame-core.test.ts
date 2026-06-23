import { describe, expect, it } from 'vitest';
import { RadarFrameCore } from './radar-frame-core';
import { syntheticFrames } from './synthetic-radar';

describe('RadarFrameCore', () => {
  it('integrates synthetic spokes into a flushed buffer of spokesPerRev x maxSpokeLen', () => {
    const core = new RadarFrameCore('mayara', 16, 8);
    for (const frame of syntheticFrames({ spokesPerRev: 16, maxSpokeLen: 8 })) {
      core.ingest(new Uint8Array(frame));
    }
    const out = core.flush();
    expect(out.spokesPerRev).toBe(16);
    expect(out.maxSpokeLen).toBe(8);
    expect(out.buffer.byteLength).toBe(16 * 8);
    expect(new Uint8Array(out.buffer).some((b) => b !== 0)).toBe(true);
  });

  it('flush returns a copy, so the live accumulator survives a transfer of the flushed buffer', () => {
    const core = new RadarFrameCore('mayara', 4, 4);
    for (const frame of syntheticFrames({ spokesPerRev: 4, maxSpokeLen: 4 })) {
      core.ingest(new Uint8Array(frame));
    }
    const first = core.flush();
    structuredClone(first.buffer, { transfer: [first.buffer] });
    core.ingest(new Uint8Array(syntheticFrames({ spokesPerRev: 4, maxSpokeLen: 4 })[0]));
    expect(() => core.flush()).not.toThrow();
  });
});
