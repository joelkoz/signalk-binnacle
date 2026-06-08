import { createRasterOverlay, type OverlayModule } from '$shared/map';
import type { StreamingChartSource } from './streaming-sources';

// A streaming bathymetry chart is a hosted raster overlay in the bathymetry band, just above the
// base map. The generic raster overlay lives in shared so other slices can reuse it.
export function createStreamingChartOverlay(source: StreamingChartSource): OverlayModule {
  return createRasterOverlay(source, 'bathymetry');
}
