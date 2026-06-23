import { headingSpokes, spokesToRadians, writeSpoke } from './radar-math';
import { decodeMayara, decodeWdantuma, type RadarMessage } from './radar-protocol';
import type { RadarProvider } from './radar-types';

export interface RadarFrame {
  buffer: ArrayBuffer;
  spokesPerRev: number;
  maxSpokeLen: number;
  range: number;
  heading?: number;
}

export class RadarFrameCore {
  readonly #decode: (bytes: Uint8Array) => RadarMessage;
  readonly #spokesPerRev: number;
  readonly #maxSpokeLen: number;
  // The live accumulator is retained across flushes (persistence is per-angle overwrite). flush()
  // copies it, so the transferred buffer is never this one and a write after a flush cannot detach.
  readonly #accumulator: Uint8Array;
  #range = 0;
  #heading: number | undefined;

  constructor(provider: RadarProvider, spokesPerRev: number, maxSpokeLen: number) {
    this.#decode = provider === 'wdantuma' ? decodeWdantuma : decodeMayara;
    this.#spokesPerRev = spokesPerRev;
    this.#maxSpokeLen = maxSpokeLen;
    this.#accumulator = new Uint8Array(spokesPerRev * maxSpokeLen);
  }

  ingest(bytes: Uint8Array): void {
    const message = this.#decode(bytes);
    for (const spoke of message.spokes) {
      writeSpoke(this.#accumulator, this.#spokesPerRev, this.#maxSpokeLen, spoke);
      this.#range = spoke.range;
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
    };
  }
}
