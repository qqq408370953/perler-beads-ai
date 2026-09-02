import { calculateQuantizedDominantColor } from './patternColorProcessing.ts';

export type SampledRgbColor = { r: number; g: number; b: number };
export type SourceSamplingMode = 'dominant' | 'average';

type AxisGrid = {
  pitch: number;
  offset: number;
};

type DetectedGrid = {
  x: AxisGrid;
  y: AxisGrid;
};

type SampleRegion = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

function pixelLuminance(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  const index = (y * width + x) * 4;
  return 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
}

function createDarkLineProfile(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  axis: 'x' | 'y',
): number[] {
  const axisLength = axis === 'x' ? width : height;
  const crossLength = axis === 'x' ? height : width;
  const crossStep = Math.max(1, Math.floor(crossLength / 256));
  const profile = Array(axisLength).fill(0);

  for (let position = 2; position < axisLength - 2; position++) {
    let darkness = 0;
    let sampleCount = 0;
    for (let cross = 0; cross < crossLength; cross += crossStep) {
      const x = axis === 'x' ? position : cross;
      const y = axis === 'x' ? cross : position;
      const beforeX = axis === 'x' ? position - 2 : cross;
      const beforeY = axis === 'x' ? cross : position - 2;
      const afterX = axis === 'x' ? position + 2 : cross;
      const afterY = axis === 'x' ? cross : position + 2;
      const index = (y * width + x) * 4;
      if (data[index + 3] < 128) continue;

      const center = pixelLuminance(data, width, x, y);
      const surrounding = (
        pixelLuminance(data, width, beforeX, beforeY)
        + pixelLuminance(data, width, afterX, afterY)
      ) / 2;
      darkness += Math.max(0, surrounding - center);
      sampleCount++;
    }
    profile[position] = sampleCount > 0 ? darkness / sampleCount : 0;
  }

  return profile;
}

function estimateAxisGrid(profile: number[], targetCellSize: number): AxisGrid | null {
  const minPitch = Math.max(6, Math.ceil(targetCellSize * 1.45));
  const maxPitch = Math.min(72, Math.floor(profile.length / 6));
  if (maxPitch < minPitch) return null;

  const globalMean = profile.reduce((sum, value) => sum + value, 0) / profile.length;
  if (globalMean < 0.5) return null;

  const strongPeakThreshold = Math.max(6, globalMean * 1.8);
  let best: { pitch: number; offset: number; score: number; contrast: number; peak: number } | null = null;
  for (let pitch = minPitch; pitch <= maxPitch; pitch++) {
    let peak = 0;
    let offset = 0;
    let supportedPhaseFound = false;
    for (let phase = 0; phase < pitch; phase++) {
      let phaseSum = 0;
      let phaseCount = 0;
      let strongPeakCount = 0;
      for (let position = phase; position < profile.length; position += pitch) {
        phaseSum += profile[position];
        phaseCount++;
        if (profile[position] >= strongPeakThreshold) strongPeakCount++;
      }
      const phaseMean = phaseCount > 0 ? phaseSum / phaseCount : 0;
      const requiredPeakCount = Math.max(3, Math.ceil(phaseCount * 0.45));
      if (strongPeakCount < requiredPeakCount) continue;
      if (phaseMean > peak) {
        peak = phaseMean;
        offset = phase;
        supportedPhaseFound = true;
      }
    }
    if (!supportedPhaseFound) continue;

    const contrast = peak / (globalMean + 1);
    const repeats = profile.length / pitch;
    const score = contrast * Math.sqrt(repeats);
    if (!best || score > best.score) best = { pitch, offset, score, contrast, peak };
  }

  if (!best || best.contrast < 1.8 || best.peak < 6) return null;
  return { pitch: best.pitch, offset: best.offset };
}

function detectExistingGrid(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  columns: number,
  rows: number,
): DetectedGrid | null {
  const x = estimateAxisGrid(
    createDarkLineProfile(data, width, height, 'x'),
    width / columns,
  );
  const y = estimateAxisGrid(
    createDarkLineProfile(data, width, height, 'y'),
    height / rows,
  );
  if (!x || !y) return null;

  const pitchRatio = x.pitch / y.pitch;
  const xScale = x.pitch / (width / columns);
  const yScale = y.pitch / (height / rows);
  if (
    pitchRatio < 0.75
    || pitchRatio > 1.33
    || xScale < 1.45
    || yScale < 1.45
    || Math.abs(xScale - yScale) > 0.55
  ) {
    return null;
  }

  return { x, y };
}

function regularRegion(
  col: number,
  row: number,
  width: number,
  height: number,
  columns: number,
  rows: number,
): SampleRegion {
  return {
    startX: Math.floor(col * width / columns),
    startY: Math.floor(row * height / rows),
    endX: Math.min(width, Math.ceil((col + 1) * width / columns)),
    endY: Math.min(height, Math.ceil((row + 1) * height / rows)),
  };
}

function gridAwareRegion(
  col: number,
  row: number,
  width: number,
  height: number,
  columns: number,
  rows: number,
  grid: DetectedGrid,
): SampleRegion {
  const centerX = (col + 0.5) * width / columns;
  const centerY = (row + 0.5) * height / rows;
  const cellX = Math.floor((centerX - grid.x.offset) / grid.x.pitch);
  const cellY = Math.floor((centerY - grid.y.offset) / grid.y.pitch);
  const sourceStartX = grid.x.offset + cellX * grid.x.pitch;
  const sourceStartY = grid.y.offset + cellY * grid.y.pitch;
  const marginX = Math.max(1, Math.round(grid.x.pitch * 0.16));
  const marginY = Math.max(1, Math.round(grid.y.pitch * 0.16));
  const region = {
    startX: Math.max(0, Math.ceil(sourceStartX + marginX)),
    startY: Math.max(0, Math.ceil(sourceStartY + marginY)),
    endX: Math.min(width, Math.floor(sourceStartX + grid.x.pitch - marginX)),
    endY: Math.min(height, Math.floor(sourceStartY + grid.y.pitch - marginY)),
  };

  return region.endX > region.startX && region.endY > region.startY
    ? region
    : regularRegion(col, row, width, height, columns, rows);
}

function calculateAverageColor(
  data: Uint8ClampedArray,
  width: number,
  region: SampleRegion,
): SampledRgbColor | null {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let y = region.startY; y < region.endY; y++) {
    for (let x = region.startX; x < region.endX; x++) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 128) continue;
      red += data[index];
      green += data[index + 1];
      blue += data[index + 2];
      count++;
    }
  }
  if (count === 0) return null;
  return {
    r: Math.round(red / count),
    g: Math.round(green / count),
    b: Math.round(blue / count),
  };
}

function hasOpaquePixel(
  data: Uint8ClampedArray,
  width: number,
  region: SampleRegion,
): boolean {
  for (let y = region.startY; y < region.endY; y++) {
    for (let x = region.startX; x < region.endX; x++) {
      if (data[(y * width + x) * 4 + 3] >= 128) return true;
    }
  }
  return false;
}

export function calculateRepresentativeRgbGrid(
  data: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  columns: number,
  rows: number,
  mode: SourceSamplingMode,
): Array<Array<SampledRgbColor | null>> {
  const grid = detectExistingGrid(data, imageWidth, imageHeight, columns, rows);
  const result = Array.from({ length: rows }, () => (
    Array<SampledRgbColor | null>(columns).fill(null)
  ));
  const colorBySourceCell = new Map<string, SampledRgbColor | null>();

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const targetRegion = regularRegion(col, row, imageWidth, imageHeight, columns, rows);
      if (grid && !hasOpaquePixel(data, imageWidth, targetRegion)) {
        result[row][col] = null;
        continue;
      }
      const region = grid
        ? gridAwareRegion(col, row, imageWidth, imageHeight, columns, rows, grid)
        : regularRegion(col, row, imageWidth, imageHeight, columns, rows);
      const cacheKey = `${region.startX}:${region.startY}:${region.endX}:${region.endY}:${mode}`;
      if (colorBySourceCell.has(cacheKey)) {
        result[row][col] = colorBySourceCell.get(cacheKey) ?? null;
        continue;
      }

      const representative = mode === 'dominant'
        ? calculateQuantizedDominantColor(
          data,
          imageWidth,
          region.startX,
          region.startY,
          region.endX,
          region.endY,
        )
        : calculateAverageColor(data, imageWidth, region);
      colorBySourceCell.set(cacheKey, representative);
      result[row][col] = representative;
    }
  }

  return result;
}
