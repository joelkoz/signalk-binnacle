import { describe, expect, it } from 'vitest';
import { RadarFrameCore } from './radar-frame-core';
import { syntheticFrames } from './synthetic-radar';

describe('RadarFrameCore', () => {
  it('integrates synthetic spokes into a flushed buffer of spokesPerRev x maxSpokeLen', () => {
    const core = new RadarFrameCore(16, 8);
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
    const core = new RadarFrameCore(4, 4);
    for (const frame of syntheticFrames({ spokesPerRev: 4, maxSpokeLen: 4 })) {
      core.ingest(new Uint8Array(frame));
    }
    const first = core.flush();
    structuredClone(first.buffer, { transfer: [first.buffer] });
    core.ingest(new Uint8Array(syntheticFrames({ spokesPerRev: 4, maxSpokeLen: 4 })[0]));
    expect(() => core.flush()).not.toThrow();
  });

  it('a truncated frame does not corrupt the accumulator: later valid frames still integrate', () => {
    const core = new RadarFrameCore(4, 4);
    const good = syntheticFrames({ spokesPerRev: 4, maxSpokeLen: 4 });
    const truncated = new Uint8Array(good[0].slice(0, 2));
    // The worker wraps ingest in try/catch, so a decode throw on a truncated frame is swallowed there;
    // here we simulate that and assert the core still integrates subsequent valid frames.
    try {
      core.ingest(truncated);
    } catch {
      // expected: a truncated frame may throw; the worker drops it and keeps the stream alive.
    }
    for (const frame of good) core.ingest(new Uint8Array(frame));
    expect(new Uint8Array(core.flush().buffer).some((b) => b !== 0)).toBe(true);
  });
});
