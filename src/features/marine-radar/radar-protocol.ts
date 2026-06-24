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

export interface RadarMessage {
  spokes: RadarSpoke[];
}

function readSpoke(pbf: Pbf, end: number): RadarSpoke {
  const spoke: RadarSpoke = { angle: 0, range: 0, data: new Uint8Array(0) };
  while (pbf.pos < end) {
    const tag = pbf.readVarint();
    const field = tag >> 3;
    if (field === 1) spoke.angle = pbf.readVarint();
    else if (field === 2) spoke.bearing = pbf.readVarint();
    else if (field === 3) spoke.range = pbf.readVarint();
    else if (field === 4) spoke.time = pbf.readVarint();
    else if (field === 5) spoke.data = pbf.readBytes();
    else if (field === 6) spoke.lat = pbf.readDouble();
    else if (field === 7) spoke.lon = pbf.readDouble();
    else pbf.skip(tag);
  }
  return spoke;
}

// Decode a Signal K radar spoke message (RadarMessage.proto: `repeated Spoke spokes = 2`, lat/lon as
// double degrees). Unknown fields are skipped so a provider extension never breaks the decode.
export function decodeRadarMessage(bytes: Uint8Array): RadarMessage {
  const pbf = new Pbf(bytes);
  const msg: RadarMessage = { spokes: [] };
  const len = bytes.length;
  while (pbf.pos < len) {
    const tag = pbf.readVarint();
    const field = tag >> 3;
    if (field === 2) {
      const end = pbf.readVarint() + pbf.pos;
      msg.spokes.push(readSpoke(pbf, end));
    } else {
      pbf.skip(tag);
    }
  }
  return msg;
}
