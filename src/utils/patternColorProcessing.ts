import type { MappedPixel, PaletteColor, RgbColor } from './pixelation';

const TRANSPARENT_COLOR_KEY = 'ERASE';
const DEFAULT_BUCKET_SIZE = 16;
const MAX_NOISE_COLOR_DISTANCE = 0.24;
const MIN_NEIGHBOR_CONSENSUS = 0.6;

type ColorBucket = {
  key: number;
  offsetIndex: number;
  count: number;
  rSum: number;
  gSum: number;
  bSum: number;
};

type OklabColor = {
  l: number;
  a: number;
  b: number;
};

type CachedPaletteColor = {
  color: PaletteColor;
  lab: OklabColor;
};

const paletteLabCache = new WeakMap<PaletteColor[], CachedPaletteColor[]>();

function clonePixelData(pixelData: MappedPixel[][]): MappedPixel[][] {
  return pixelData.map((row) => row.map((cell) => ({ ...cell })));
}

function isVisibleCell(cell?: MappedPixel): cell is MappedPixel {
  return Boolean(cell && !cell.isExternal && cell.key !== TRANSPARENT_COLOR_KEY);
}

function rgbDistance(first: RgbColor, second: RgbColor): number {
  return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b);
}

function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function rgbToOklab(rgb: RgbColor): OklabColor {
  const red = srgbChannelToLinear(rgb.r);
  const green = srgbChannelToLinear(rgb.g);
  const blue = srgbChannelToLinear(rgb.b);

  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

export function perceptualColorDistance(first: RgbColor, second: RgbColor): number {
  const firstLab = rgbToOklab(first);
  const secondLab = rgbToOklab(second);
  return oklabDistance(firstLab, secondLab);
}

function oklabDistance(first: OklabColor, second: OklabColor): number {
  return Math.hypot(
    first.l - second.l,
    first.a - second.a,
    first.b - second.b,
  );
}

function getCachedPaletteColors(palette: PaletteColor[]): CachedPaletteColor[] {
  const cached = paletteLabCache.get(palette);
  if (cached) return cached;

  const converted = palette.map((color) => ({ color, lab: rgbToOklab(color.rgb) }));
  paletteLabCache.set(palette, converted);
  return converted;
}

export function findClosestPerceptualPaletteColor(
  targetRgb: RgbColor,
  palette: PaletteColor[],
): PaletteColor {
  if (palette.length === 0) {
    return { key: 'ERR', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } };
  }

  const targetLab = rgbToOklab(targetRgb);
  const cachedPalette = getCachedPaletteColors(palette);
  let closest = cachedPalette[0];
  let closestDistance = Infinity;

  for (const candidate of cachedPalette) {
    const distance = oklabDistance(targetLab, candidate.lab);
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
    if (distance === 0) break;
  }

  return closest.color;
}

export function calculateQuantizedDominantColor(
  data: Uint8ClampedArray,
  imageWidth: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  bucketSize = DEFAULT_BUCKET_SIZE,
): RgbColor | null {
  if (imageWidth <= 0 || endX <= startX || endY <= startY) return null;

  const safeBucketSize = Math.max(1, Math.min(256, Math.round(bucketSize)));
  // 两套错开半个桶宽的直方图可避免相近颜色恰好落在固定桶边界两侧。
  const bucketOffsets = [0, Math.floor(safeBucketSize / 2)];
  const bucketSets = bucketOffsets.map(() => new Map<number, ColorBucket>());
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let pixelCount = 0;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const index = (y * imageWidth + x) * 4;
      if (data[index + 3] < 128) continue;

      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      bucketOffsets.forEach((offset, offsetIndex) => {
        const redBucket = Math.floor((red + offset) / safeBucketSize);
        const greenBucket = Math.floor((green + offset) / safeBucketSize);
        const blueBucket = Math.floor((blue + offset) / safeBucketSize);
        const bucketKey = (redBucket << 16) | (greenBucket << 8) | blueBucket;
        const bucketSet = bucketSets[offsetIndex];
        const bucket = bucketSet.get(bucketKey) ?? {
          key: bucketKey,
          offsetIndex,
          count: 0,
          rSum: 0,
          gSum: 0,
          bSum: 0,
        };

        bucket.count++;
        bucket.rSum += red;
        bucket.gSum += green;
        bucket.bSum += blue;
        bucketSet.set(bucketKey, bucket);
      });
      totalR += red;
      totalG += green;
      totalB += blue;
      pixelCount++;
    }
  }

  if (pixelCount === 0) return null;

  const average = {
    r: totalR / pixelCount,
    g: totalG / pixelCount,
    b: totalB / pixelCount,
  };
  let winningBucket: ColorBucket | null = null;
  let winningDistance = Infinity;

  bucketSets.flatMap((bucketSet) => [...bucketSet.values()]).forEach((bucket) => {
    const bucketAverage = {
      r: bucket.rSum / bucket.count,
      g: bucket.gSum / bucket.count,
      b: bucket.bSum / bucket.count,
    };
    const distanceToAverage = rgbDistance(bucketAverage, average);
    const hasHigherCount = !winningBucket || bucket.count > winningBucket.count;
    const winsTie = winningBucket
      && bucket.count === winningBucket.count
      && (distanceToAverage < winningDistance
        || (distanceToAverage === winningDistance
          && (bucket.offsetIndex < winningBucket.offsetIndex
            || (bucket.offsetIndex === winningBucket.offsetIndex && bucket.key < winningBucket.key))));

    if (hasHigherCount || winsTie) {
      winningBucket = bucket;
      winningDistance = distanceToAverage;
    }
  });

  if (!winningBucket) return null;
  const selectedBucket = winningBucket as ColorBucket;
  return {
    r: Math.round(selectedBucket.rSum / selectedBucket.count),
    g: Math.round(selectedBucket.gSum / selectedBucket.count),
    b: Math.round(selectedBucket.bSum / selectedBucket.count),
  };
}

function mergeSimilarColors(
  sourceData: MappedPixel[][],
  dimensions: { N: number; M: number },
  palette: PaletteColor[],
  threshold: number,
): MappedPixel[][] {
  const mergedData = clonePixelData(sourceData);
  if (threshold <= 0) return mergedData;

  const { N, M } = dimensions;
  const paletteByKey = new Map(palette.map((color) => [color.key, color]));
  const colorCounts = new Map<string, number>();
  sourceData.flat().forEach((cell) => {
    if (isVisibleCell(cell)) colorCounts.set(cell.key, (colorCounts.get(cell.key) ?? 0) + 1);
  });
  const colorsByFrequency = [...colorCounts.entries()]
    .sort((first, second) => second[1] - first[1])
    .map(([key]) => key);
  const replacedColors = new Set<string>();

  for (let currentIndex = 0; currentIndex < colorsByFrequency.length; currentIndex++) {
    const currentKey = colorsByFrequency[currentIndex];
    if (replacedColors.has(currentKey)) continue;
    const currentColor = paletteByKey.get(currentKey);
    if (!currentColor) continue;

    for (let candidateIndex = currentIndex + 1; candidateIndex < colorsByFrequency.length; candidateIndex++) {
      const candidateKey = colorsByFrequency[candidateIndex];
      if (replacedColors.has(candidateKey)) continue;
      const candidateColor = paletteByKey.get(candidateKey);
      if (!candidateColor || rgbDistance(currentColor.rgb, candidateColor.rgb) >= threshold) continue;

      replacedColors.add(candidateKey);
      for (let row = 0; row < M; row++) {
        for (let col = 0; col < N; col++) {
          if (mergedData[row]?.[col]?.key === candidateKey) {
            mergedData[row][col] = {
              ...mergedData[row][col],
              key: currentColor.key,
              color: currentColor.hex,
            };
          }
        }
      }
    }
  }

  return mergedData;
}

function limitColorCount(
  sourceData: MappedPixel[][],
  dimensions: { N: number; M: number },
  palette: PaletteColor[],
  maxColorCount: number,
): MappedPixel[][] {
  const limitedData = clonePixelData(sourceData);
  if (maxColorCount <= 0) return limitedData;

  const { N, M } = dimensions;
  const paletteByKey = new Map(palette.map((color) => [color.key, color]));
  const colorCounts = new Map<string, number>();
  sourceData.flat().forEach((cell) => {
    if (isVisibleCell(cell)) colorCounts.set(cell.key, (colorCounts.get(cell.key) ?? 0) + 1);
  });
  const colorsByFrequency = [...colorCounts.entries()]
    .sort((first, second) => second[1] - first[1])
    .map(([key]) => key);
  if (colorsByFrequency.length <= maxColorCount) return limitedData;

  const keptKeys = colorsByFrequency.slice(0, maxColorCount);
  const keptKeySet = new Set(keptKeys);
  const keptColors = keptKeys
    .map((key) => paletteByKey.get(key))
    .filter((color): color is PaletteColor => Boolean(color));
  const replacementByKey = new Map<string, PaletteColor>();

  colorsByFrequency.slice(maxColorCount).forEach((droppedKey) => {
    const droppedColor = paletteByKey.get(droppedKey);
    if (!droppedColor || keptColors.length === 0) return;
    replacementByKey.set(
      droppedKey,
      findClosestPerceptualPaletteColor(droppedColor.rgb, keptColors),
    );
  });

  for (let row = 0; row < M; row++) {
    for (let col = 0; col < N; col++) {
      const cell = limitedData[row]?.[col];
      if (!isVisibleCell(cell) || keptKeySet.has(cell.key)) continue;
      const selectedColor = replacementByKey.get(cell.key);
      if (selectedColor) {
        limitedData[row][col] = {
          ...cell,
          key: selectedColor.key,
          color: selectedColor.hex,
        };
      }
    }
  }

  return limitedData;
}

export function removeIsolatedColorNoise(
  sourceData: MappedPixel[][],
  dimensions: { N: number; M: number },
  palette: PaletteColor[],
): MappedPixel[][] {
  const { N, M } = dimensions;
  const paletteByKey = new Map(palette.map((color) => [color.key, color]));
  const visited = Array.from({ length: M }, () => Array(N).fill(false));
  const replacements: Array<{ row: number; col: number; color: PaletteColor }> = [];
  const maxComponentSize = 3;
  const cardinalNeighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
  const surroundingNeighbors = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1],
  ] as const;

  for (let startRow = 0; startRow < M; startRow++) {
    for (let startCol = 0; startCol < N; startCol++) {
      if (visited[startRow][startCol]) continue;
      const startCell = sourceData[startRow]?.[startCol];
      if (!isVisibleCell(startCell)) {
        visited[startRow][startCol] = true;
        continue;
      }

      const component: Array<{ row: number; col: number }> = [];
      const stack = [{ row: startRow, col: startCol }];
      visited[startRow][startCol] = true;

      while (stack.length > 0) {
        const current = stack.pop()!;
        component.push(current);
        cardinalNeighbors.forEach(([rowOffset, colOffset]) => {
          const row = current.row + rowOffset;
          const col = current.col + colOffset;
          if (row < 0 || row >= M || col < 0 || col >= N || visited[row][col]) return;
          const neighbor = sourceData[row]?.[col];
          if (isVisibleCell(neighbor) && neighbor.key === startCell.key) {
            visited[row][col] = true;
            stack.push({ row, col });
          }
        });
      }

      if (component.length > maxComponentSize) continue;

      const componentPositions = new Set(component.map(({ row, col }) => `${row}:${col}`));
      const boundaryPositions = new Set<string>();
      let touchesEmptyCell = false;

      component.forEach(({ row, col }) => {
        surroundingNeighbors.forEach(([rowOffset, colOffset]) => {
          const neighborRow = row + rowOffset;
          const neighborCol = col + colOffset;
          if (neighborRow < 0 || neighborRow >= M || neighborCol < 0 || neighborCol >= N) {
            touchesEmptyCell = true;
            return;
          }
          const positionKey = `${neighborRow}:${neighborCol}`;
          if (componentPositions.has(positionKey)) return;
          const neighbor = sourceData[neighborRow]?.[neighborCol];
          if (!isVisibleCell(neighbor)) {
            touchesEmptyCell = true;
            return;
          }
          boundaryPositions.add(positionKey);
        });
      });

      if (touchesEmptyCell || boundaryPositions.size === 0) continue;

      const neighborCounts = new Map<string, number>();
      boundaryPositions.forEach((positionKey) => {
        const [row, col] = positionKey.split(':').map(Number);
        const neighbor = sourceData[row][col];
        neighborCounts.set(neighbor.key, (neighborCounts.get(neighbor.key) ?? 0) + 1);
      });
      const [dominantNeighborKey, dominantNeighborCount] = [...neighborCounts.entries()]
        .sort((first, second) => second[1] - first[1])[0];
      const minimumNeighborCount = Math.min(4, boundaryPositions.size);
      if (
        dominantNeighborCount < minimumNeighborCount
        || dominantNeighborCount / boundaryPositions.size < MIN_NEIGHBOR_CONSENSUS
      ) {
        continue;
      }

      const sourceColor = paletteByKey.get(startCell.key);
      const replacementColor = paletteByKey.get(dominantNeighborKey);
      const sourceLab = sourceColor ? rgbToOklab(sourceColor.rgb) : null;
      const replacementLab = replacementColor ? rgbToOklab(replacementColor.rgb) : null;
      const sourceChroma = sourceLab ? Math.hypot(sourceLab.a, sourceLab.b) : Infinity;
      const isSubtleHighlight = Boolean(
        sourceLab
        && replacementLab
        && sourceLab.l - replacementLab.l >= 0.025
        && sourceChroma <= 0.08
      );
      if (
        !sourceColor
        || !replacementColor
        || isSubtleHighlight
        || perceptualColorDistance(sourceColor.rgb, replacementColor.rgb) > MAX_NOISE_COLOR_DISTANCE
      ) {
        continue;
      }

      component.forEach(({ row, col }) => replacements.push({ row, col, color: replacementColor }));
    }
  }

  const denoisedData = clonePixelData(sourceData);
  replacements.forEach(({ row, col, color }) => {
    denoisedData[row][col] = {
      ...denoisedData[row][col],
      key: color.key,
      color: color.hex,
    };
  });
  return denoisedData;
}

export function consolidatePatternColors(
  sourceData: MappedPixel[][],
  dimensions: { N: number; M: number },
  palette: PaletteColor[],
  options: { similarityThreshold: number; maxColorCount: number },
): MappedPixel[][] {
  const preparedData = preparePatternColors(sourceData, dimensions, palette, options);
  return removeIsolatedColorNoise(preparedData, dimensions, palette);
}

export function preparePatternColors(
  sourceData: MappedPixel[][],
  dimensions: { N: number; M: number },
  palette: PaletteColor[],
  options: { similarityThreshold: number; maxColorCount: number },
): MappedPixel[][] {
  const mergedData = mergeSimilarColors(
    sourceData,
    dimensions,
    palette,
    options.similarityThreshold,
  );
  const limitedData = limitColorCount(
    mergedData,
    dimensions,
    palette,
    options.maxColorCount,
  );
  return limitedData;
}
