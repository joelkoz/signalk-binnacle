// 'vessels.urn:mrn:imo:mmsi:368000000' reads as '368000000'; an unrecognized id passes through.
export function shortVesselId(id: string): string {
  const lastColon = id.lastIndexOf(':');
  return lastColon >= 0 ? id.slice(lastColon + 1) : id;
}
