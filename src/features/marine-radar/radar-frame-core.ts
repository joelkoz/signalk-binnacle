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
}

export class RadarFrameCore {
  readonly #spokesPerRev: number;
  readonly #maxSpokeLen: number;
  // The live accumulator is retained across flushes (persistence is per-angle overwrite). flush()
  // copies it, so the transferred buffer is never this one and a write after a flush cannot detach.
  readonly #accumulator: Uint8Array;
  #range = 0;
  #heading: number | undefined;
  #sweep: number | undefined;

  constructor(spokesPerRev: number, maxSpokeLen: number) {
    this.#spokesPerRev = spokesPerRev;
    this.#maxSpokeLen = maxSpokeLen;
    this.#accumulator = new Uint8Array(spokesPerRev * maxSpokeLen);
  }

  ingest(bytes: Uint8Array): void {
    const message = decodeRadarMessage(bytes);
    for (const spoke of message.spokes) {
      writeSpoke(this.#accumulator, this.#spokesPerRev, this.#maxSpokeLen, spoke);
      this.#range = spoke.range;
      this.#sweep = (spoke.angle % this.#spokesPerRev) / this.#spokesPerRev;
      if (spoke.bearing !== undefined) {
        this.#heading = spokesToRadians(
          headingSpokes(spoke.angle, spoke.bearing, this.#spokesPerRev),
          this.#spokesPerRev,
        );
      }
    }
  }

  flush(): RadarFrame {
    const copy = this.#accumulator.slice();
    return {
      buffer: copy.buffer,
      spokesPerRev: this.#spokesPerRev,
      maxSpokeLen: this.#maxSpokeLen,
      range: this.#range,
      heading: this.#heading,
      sweep: this.#sweep,
    };
  }
}
