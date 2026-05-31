export type MapSourceType = 'tilelayer' | 'WMS' | 'WMTS' | 'tileJSON' | 'mapstyleJSON' | 'S-57';

export interface SignalKChart {
  identifier: string;
  name: string;
  description?: string;
  type: MapSourceType;
  scale?: number;
  bounds?: [number, number, number, number];
  minzoom?: number;
  maxzoom?: number;
  format?: string;
  url?: string;
  tilemapUrl?: string;
  layers?: string[];
}
