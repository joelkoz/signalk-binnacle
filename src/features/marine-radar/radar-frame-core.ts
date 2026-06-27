import { headingSpokes, spokesToRadians, writeSpoke } from './radar-math';
import { decodeRadarMessage } from './radar-protocol';

export interface RadarFrame {
  buffer: ArrayBuffer;
  spokesPerRev: number;
  maxSpokeLen: number;
  range: number;
  heading?: number;
  // The freshest spoke's column position in the texture, normalized to [0, 1), so the renderer can draw
  // a sweep wedge at the current scan angle. Undefined until the first spoke integrates.
  sweep?: number;
  // How many spokes were integrated since the previous flush. The controller gates the "live" status on
  // this being > 0, so a stream of undecodable or empty messages reports connected-no-data rather than
  // falsely reading as live.
  spokeCount: number;
}

export class RadarFrameCore {
  readonly #spokesPerRev: number;
  readonly #maxSpokeLen: number;
  // The live accumulator is retained across flushes (persistence is per-angle overwrite). flush()
  // copies it, so the transferred buffer is never this one and a write after a flush cannot detach.
  readonly #accumulator: Uint8Array;
  #range: number;
  #heading: number | undefined;
  #sweep: number | undefined;
  #spokesSinceFlush = 0;

  // initialRange seeds the display range from discovery (RadarInfo.range) so the echo quad and rings
  // have a sane extent from the first frame, before any spoke reports a range, and survive a spoke that
  // reports 0 (proto3 default when the field is absent).
  constructor(spokesPerRev: number, maxSpokeLen: number, initialRange = 0) {
    this.#spokesPerRev = spokesPerRev;
    this.#maxSpokeLen = maxSpokeLen;
    this.#accumulator = new Uint8Array(spokesPerRev * maxSpokeLen);
    this.#range = initialRange > 0 ? initialRange : 0;
  }

  // Decode one stream message into the accumulator and return how many spokes it integrated.
  ingest(bytes: Uint8Array): number {
    const message = decodeRadarMessage(bytes);
    for (const spoke of message.spokes) {
      writeSpoke(this.#accumulator, this.#spokesPerRev, this.#maxSpokeLen, spoke);
      // Keep the last POSITIVE range: a spoke that omits range (proto3 default 0) or reports 0 during
      // warmup must not clobber a known-good range and collapse the echo quad to zero extent.
      if (spoke.range > 0) this.#range = spoke.range;
      this.#sweep = (spoke.angle % this.#spokesPerRev) / this.#spokesPerRev;
      if (spoke.bearing !== undefined) {
        this.#heading = spokesToRadians(
          headingSpokes(spoke.angle, spoke.bearing, this.#spokesPerRev),
          this.#spokesPerRev,
        );
      }
    }
    this.#spokesSinceFlush += message.spokes.length;
    return message.spokes.length;
  }

  flush(): RadarFrame {
    const copy = this.#accumulator.slice();
    const spokeCount = this.#spokesSinceFlush;
    this.#spokesSinceFlush = 0;
    return {
      buffer: copy.buffer,
      spokesPerRev: this.#spokesPerRev,
      maxSpokeLen: this.#maxSpokeLen,
      range: this.#range,
      heading: this.#heading,
      sweep: this.#sweep,
      spokeCount,
    };
  }
}
