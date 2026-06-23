import Pbf from 'pbf';

export interface RadarSpoke {
  angle: number;
  bearing?: number;
  range: number;
  time?: number;
  lat?: number;
  lon?: number;
  data: Uint8Array;
}

export interface ControlValue {
  id: string;
  value: number;
  auto?: boolean;
  description?: string;
}

export interface RadarMessage {
  radar?: number;
  spokes: RadarSpoke[];
  controls?: ControlValue[];
}

type LatLonScale = 'double' | 'int64-1e16';

// pbf exposes no signed-64-bit reader, and int64 1e-16 degrees overflows Number.MAX_SAFE_INTEGER, so
// read the raw varint into a BigInt and apply the two's-complement sign before narrowing to a Number.
function readSignedVarint64(pbf: Pbf): bigint {
  let result = 0n;
  let shift = 0n;
  let byte = 0;
  do {
    byte = pbf.buf[pbf.pos] ?? 0;
    pbf.pos += 1;
    result |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
  } while (byte & 0x80);
  if (result >= 1n << 63n) result -= 1n << 64n;
  return result;
}

function readLatLon(pbf: Pbf, scale: LatLonScale): number {
  if (scale === 'double') return pbf.readDouble();
  return Number(readSignedVarint64(pbf)) / 1e16;
}

function readSpoke(pbf: Pbf, end: number, scale: LatLonScale): RadarSpoke {
  const spoke: RadarSpoke = { angle: 0, range: 0, data: new Uint8Array(0) };
  while (pbf.pos < end) {
    const tag = pbf.readVarint();
    const field = tag >> 3;
    if (field === 1) spoke.angle = pbf.readVarint();
    else if (field === 2) spoke.bearing = pbf.readVarint();
    else if (field === 3) spoke.range = pbf.readVarint();
    else if (field === 4) spoke.time = pbf.readVarint();
    else if (field === 5) spoke.data = pbf.readBytes();
    else if (field === 6) spoke.lat = readLatLon(pbf, scale);
    else if (field === 7) spoke.lon = readLatLon(pbf, scale);
    else pbf.skip(tag);
  }
  return spoke;
}

function readControlValue(pbf: Pbf, end: number): ControlValue {
  const cv: ControlValue = { id: '', value: 0 };
  while (pbf.pos < end) {
    const tag = pbf.readVarint();
    const field = tag >> 3;
    if (field === 1) cv.id = pbf.readString();
    else if (field === 2) cv.value = pbf.readFloat();
    else if (field === 3) cv.auto = pbf.readBoolean();
    else if (field === 4) cv.description = pbf.readString();
    else pbf.skip(tag);
  }
  return cv;
}

function decode(bytes: Uint8Array, scale: LatLonScale, hasEnvelope: boolean): RadarMessage {
  const pbf = new Pbf(bytes);
  const msg: RadarMessage = { spokes: [] };
  const len = bytes.length;
  while (pbf.pos < len) {
    const tag = pbf.readVarint();
    const field = tag >> 3;
    if (field === 1 && hasEnvelope) {
      msg.radar = pbf.readVarint();
    } else if (field === 2) {
      const end = pbf.readVarint() + pbf.pos;
      msg.spokes.push(readSpoke(pbf, end, scale));
    } else if (field === 3 && hasEnvelope) {
      const end = pbf.readVarint() + pbf.pos;
      if (!msg.controls) msg.controls = [];
      msg.controls.push(readControlValue(pbf, end));
    } else {
      pbf.skip(tag);
    }
  }
  return msg;
}

export function decodeMayara(bytes: Uint8Array): RadarMessage {
  return decode(bytes, 'double', false);
}

export function decodeWdantuma(bytes: Uint8Array): RadarMessage {
  return decode(bytes, 'int64-1e16', true);
}
