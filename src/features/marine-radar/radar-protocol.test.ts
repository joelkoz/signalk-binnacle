import Pbf from 'pbf';
import { describe, expect, it } from 'vitest';
import { decodeMayara, decodeWdantuma } from './radar-protocol';

function encodeMayaraSpoke(): Uint8Array {
  const pbf = new Pbf();
  pbf.writeMessage(
    2,
    (_obj, w) => {
      w.writeVarintField(1, 10);
      w.writeVarintField(3, 1852);
      w.writeDoubleField(6, 47.5);
      w.writeDoubleField(7, -122.3);
      w.writeBytesField(5, new Uint8Array([0, 1, 2, 255]));
    },
    0,
  );
  return pbf.finish();
}

// An independent reference encoder built from the wire spec, so the int64 fixture is not produced by
// the decoder under test. A negative int64 is its 64-bit two's complement, LEB128-encoded (10 bytes).
function uvarint(value: bigint): number[] {
  const out: number[] = [];
  let v = value;
  while (v > 0x7fn) {
    out.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  out.push(Number(v));
  return out;
}

function int64Field(tag: number, value: bigint): number[] {
  const u = value < 0n ? (1n << 64n) + value : value;
  return [(tag << 3) | 0, ...uvarint(u)];
}

function encodeWdantumaMessage(latUnits: bigint): Uint8Array {
  const spoke: number[] = [];
  spoke.push((1 << 3) | 0, 0); // angle = 0
  spoke.push((3 << 3) | 0, ...uvarint(1000n)); // range = 1000
  spoke.push(...int64Field(6, latUnits)); // lat int64
  spoke.push((5 << 3) | 2, 1, 9); // data = [9]
  const msg: number[] = [];
  msg.push((1 << 3) | 0, 3); // radar id = 3
  msg.push((2 << 3) | 2, spoke.length, ...spoke); // spoke embedded message
  return new Uint8Array(msg);
}

describe('decodeMayara', () => {
  it('decodes a spoke with double lat/lon in degrees', () => {
    const msg = decodeMayara(encodeMayaraSpoke());
    expect(msg.spokes).toHaveLength(1);
    const s = msg.spokes[0];
    expect(s.angle).toBe(10);
    expect(s.range).toBe(1852);
    expect(s.lat).toBeCloseTo(47.5, 10);
    expect(s.lon).toBeCloseTo(-122.3, 10);
    expect(Array.from(s.data)).toEqual([0, 1, 2, 255]);
  });
});

describe('decodeWdantuma', () => {
  it('decodes int64 1e-16-degree lat to degrees without precision loss at high latitude', () => {
    const latUnits = -672500000000000000n; // -67.25 * 1e16, magnitude past Number.MAX_SAFE_INTEGER
    const msg = decodeWdantuma(encodeWdantumaMessage(latUnits));
    expect(msg.radar).toBe(3);
    expect(msg.spokes[0].lat).toBeCloseTo(-67.25, 9);
  });
});
