import { type UserChartSource, zoomRange } from '$entities/user-charts';

export interface ChartSpecRow {
  label: string;
  value: string;
}

export interface ChartSpecRows {
  type: ChartSpecRow;
  zoom: ChartSpecRow;
}

// The Type and Zoom spec rows shared by the chart detail and the import review, built in one
// place so their labels and formatting cannot drift. Each caller weaves its own rows around them.
export function chartSpecRows(source: UserChartSource): ChartSpecRows {
  return {
    type: { label: 'Type', value: source.kind === 'vector' ? 'Vector' : 'Raster' },
    zoom: { label: 'Zoom', value: zoomRange(source) },
  };
}
