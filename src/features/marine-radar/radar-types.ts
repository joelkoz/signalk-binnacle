export type PixelType =
  | 'Normal'
  | 'DopplerApproaching'
  | 'DopplerReceding'
  | 'DopplerRain'
  | 'History';

export interface RadarLegend {
  pixels: Array<{ type: PixelType; color: string }>;
}

export interface ControlDefinition {
  id: string;
  name: string;
  description?: string;
  category?: string;
  dataType?: string;
  minValue?: number;
  maxValue?: number;
  stepValue?: number;
  units?: string;
  descriptions?: Record<string, string>;
  validValues?: number[];
  isReadOnly?: boolean;
  hasEnabled?: boolean;
  automatic?: { hasAuto?: boolean };
}

export interface RadarInfo {
  id: string;
  name: string;
  spokes: number;
  maxSpokeLen: number;
  spokeDataUrl?: string;
  streamUrl?: string;
  legend: RadarLegend;
  controls?: ControlDefinition[];
}

export type RadarProvider = 'mayara' | 'wdantuma';
