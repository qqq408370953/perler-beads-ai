import {
  calculatePixelGrid,
  colorDistance,
  hexToRgb,
  MappedPixel,
  PaletteColor,
  PixelationMode,
  RgbColor,
} from './pixelation';
import {
  ColorSystem,
  getMardToHexMapping,
} from './colorSystemUtils';
import { cropPixelDataToContent, TRANSPARENT_KEY, transparentColorData } from './pixelEditingUtils';
import { loadPaletteSelections, PaletteSelections, presetToSelections } from './localStorageUtils';

export interface PatternGenerationOptions {
  granularity: number;
  similarityThreshold: number;
  maxColorCount: number;
  pixelationMode: PixelationMode;
  selectedColorSystem: ColorSystem;
  autoRemoveBackground: boolean;
}

export interface PatternGenerationResult {
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
  colorCounts: { [key: string]: { count: number; color: string } };
  totalBeadCount: number;
  colorCount: number;
}

export const DEFAULT_PATTERN_GENERATION_OPTIONS: PatternGenerationOptions = {
  granularity: 85,
  similarityThreshold: 12,
  maxColorCount: 8,
  pixelationMode: PixelationMode.Dominant,
  selectedColorSystem: 'MARD',
  autoRemoveBackground: true,
};

function buildFullHexBeadPalette(): PaletteColor[] {
  const mardToHexMapping = getMardToHexMapping();
  return Object.values(mardToHexMapping)
    .map((hex) => {
      const rgb = hexToRgb(hex);
      if (!rgb) return null;
      return { key: hex.toUpperCase(), hex: hex.toUpperCase(), rgb };
    })
    .filter((color): color is PaletteColor => color !== null);
}

function loadSingleToolPaletteSelections(allHexValues: string[]): PaletteSelections {
  const savedSelections = loadPaletteSelections();
  if (!savedSelections || Object.keys(savedSelections).length === 0) {
    return presetToSelections(allHexValues, allHexValues);
  }

  const allHexSet = new Set(allHexValues);
  const validSelections: PaletteSelections = {};
  Object.entries(savedSelections).forEach(([key, value]) => {
    const normalizedHex = key.toUpperCase();
    if (/^#[0-9A-F]{6}$/i.test(normalizedHex) && allHexSet.has(normalizedHex)) {
      validSelections[normalizedHex] = value;
    }
  });

  return Object.keys(validSelections).length > 0
    ? validSelections
    : presetToSelections(allHexValues, allHexValues);
}

export function buildDefaultBeadPalette(colorSystem: ColorSystem): PaletteColor[] {
  void colorSystem;
  const fullPalette = buildFullHexBeadPalette();
  const allHexValues = fullPalette.map((color) => color.hex.toUpperCase());
  const paletteSelections = loadSingleToolPaletteSelections(allHexValues);

  return fullPalette.filter((color) => paletteSelections[color.hex.toUpperCase()]);
}

function loadImageElement(imageSrc: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = imageSrc;
  });
}

function clonePixelData(pixelData: MappedPixel[][]): MappedPixel[][] {
  return pixelData.map((row) => row.map((cell) => ({ ...cell })));
}

export function calculatePatternStats(pixelData: MappedPixel[][]): {
  colorCounts: PatternGenerationResult['colorCounts'];
  totalBeadCount: number;
  colorCount: number;
} {
  const colorCounts: PatternGenerationResult['colorCounts'] = {};
  let totalBeadCount = 0;

  pixelData.flat().forEach((cell) => {
    if (!cell || cell.isExternal || cell.key === TRANSPARENT_KEY) return;
    const hexKey = cell.color.toUpperCase();
    if (!colorCounts[hexKey]) {
      colorCounts[hexKey] = { count: 0, color: hexKey };
    }
    colorCounts[hexKey].count++;
    totalBeadCount++;
  });

  return {
    colorCounts,
    totalBeadCount,
    colorCount: Object.keys(colorCounts).length,
  };
}

function mergeSimilarColors(
  initialData: MappedPixel[][],
  dimensions: { N: number; M: number },
  palette: PaletteColor[],
  threshold: number
): MappedPixel[][] {
  const { N, M } = dimensions;
  const keyToRgbMap = new Map<string, RgbColor>();
  const keyToColorDataMap = new Map<string, PaletteColor>();
  palette.forEach((color) => {
    keyToRgbMap.set(color.key, color.rgb);
    keyToColorDataMap.set(color.key, color);
  });

  const initialColorCounts: { [key: string]: number } = {};
  initialData.flat().forEach((cell) => {
    if (cell && cell.key && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
      initialColorCounts[cell.key] = (initialColorCounts[cell.key] || 0) + 1;
    }
  });

  const colorsByFrequency = Object.entries(initialColorCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
  const mergedData = clonePixelData(initialData);
  const replacedColors = new Set<string>();

  for (let i = 0; i < colorsByFrequency.length; i++) {
    const currentKey = colorsByFrequency[i];
    if (replacedColors.has(currentKey)) continue;

    const currentRgb = keyToRgbMap.get(currentKey);
    if (!currentRgb) continue;

    for (let j = i + 1; j < colorsByFrequency.length; j++) {
      const lowerFreqKey = colorsByFrequency[j];
      if (replacedColors.has(lowerFreqKey)) continue;

      const lowerFreqRgb = keyToRgbMap.get(lowerFreqKey);
      if (!lowerFreqRgb) continue;

      if (colorDistance(currentRgb, lowerFreqRgb) >= threshold) continue;

      replacedColors.add(lowerFreqKey);
      const colorData = keyToColorDataMap.get(currentKey);
      if (!colorData) continue;

      for (let row = 0; row < M; row++) {
        for (let col = 0; col < N; col++) {
          if (mergedData[row][col].key === lowerFreqKey) {
            mergedData[row][col] = {
              key: currentKey,
              color: colorData.hex,
              isExternal: false,
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
  maxColorCount: number
): MappedPixel[][] {
  if (maxColorCount <= 0) return clonePixelData(sourceData);

  const { N, M } = dimensions;
  const limitedData = clonePixelData(sourceData);
  const keyToRgbMap = new Map<string, RgbColor>();
  const keyToColorDataMap = new Map<string, PaletteColor>();
  palette.forEach((color) => {
    keyToRgbMap.set(color.key, color.rgb);
    keyToColorDataMap.set(color.key, color);
  });

  const colorCounts: { [key: string]: number } = {};
  limitedData.flat().forEach((cell) => {
    if (cell && cell.key && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
      colorCounts[cell.key] = (colorCounts[cell.key] || 0) + 1;
    }
  });

  const colorsByFrequency = Object.entries(colorCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);

  if (colorsByFrequency.length <= maxColorCount) return limitedData;

  const keptColorKeys = colorsByFrequency.slice(0, maxColorCount);
  const keptColorSet = new Set(keptColorKeys);

  for (let row = 0; row < M; row++) {
    for (let col = 0; col < N; col++) {
      const cell = limitedData[row][col];
      if (!cell || cell.isExternal || cell.key === TRANSPARENT_KEY || keptColorSet.has(cell.key)) {
        continue;
      }

      const sourceRgb = keyToRgbMap.get(cell.key);
      if (!sourceRgb) continue;

      let closestKey = keptColorKeys[0];
      let minDistance = Infinity;

      keptColorKeys.forEach((keptKey) => {
        const keptRgb = keyToRgbMap.get(keptKey);
        if (!keptRgb) return;
        const distance = colorDistance(sourceRgb, keptRgb);
        if (distance < minDistance) {
          minDistance = distance;
          closestKey = keptKey;
        }
      });

      const colorData = keyToColorDataMap.get(closestKey);
      if (colorData) {
        limitedData[row][col] = {
          key: closestKey,
          color: colorData.hex,
          isExternal: false,
        };
      }
    }
  }

  return limitedData;
}

async function calculateSubjectMaskGridFromImage(
  imageSrc: string,
  dimensions: { N: number; M: number }
): Promise<boolean[][]> {
  const img = await loadImageElement(imageSrc);
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('无法创建主体识别画布');

  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  let borderR = 0;
  let borderG = 0;
  let borderB = 0;
  let borderCount = 0;

  const sampleBorderPixel = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    if (data[index + 3] < 32) return;
    borderR += data[index];
    borderG += data[index + 1];
    borderB += data[index + 2];
    borderCount++;
  };

  for (let x = 0; x < width; x++) {
    sampleBorderPixel(x, 0);
    sampleBorderPixel(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    sampleBorderPixel(0, y);
    sampleBorderPixel(width - 1, y);
  }

  const backgroundRgb: RgbColor = borderCount > 0
    ? {
      r: Math.round(borderR / borderCount),
      g: Math.round(borderG / borderCount),
      b: Math.round(borderB / borderCount),
    }
    : { r: 255, g: 255, b: 255 };
  const external = new Uint8Array(width * height);
  const stack: number[] = [];
  const backgroundThreshold = 48;

  const pushIfBackground = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const key = y * width + x;
    if (external[key]) return;

    const index = key * 4;
    const alpha = data[index + 3];
    if (alpha < 32) {
      external[key] = 1;
      stack.push(key);
      return;
    }

    const distance = colorDistance(
      { r: data[index], g: data[index + 1], b: data[index + 2] },
      backgroundRgb
    );
    if (distance > backgroundThreshold) return;

    external[key] = 1;
    stack.push(key);
  };

  for (let x = 0; x < width; x++) {
    pushIfBackground(x, 0);
    pushIfBackground(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    pushIfBackground(0, y);
    pushIfBackground(width - 1, y);
  }

  while (stack.length > 0) {
    const key = stack.pop()!;
    const x = key % width;
    const y = Math.floor(key / width);
    pushIfBackground(x - 1, y);
    pushIfBackground(x + 1, y);
    pushIfBackground(x, y - 1);
    pushIfBackground(x, y + 1);
  }

  const { N, M } = dimensions;
  const cellWidth = width / N;
  const cellHeight = height / M;
  const subjectMaskGrid = Array(M).fill(null).map(() => Array(N).fill(false));

  for (let row = 0; row < M; row++) {
    for (let col = 0; col < N; col++) {
      const startX = Math.floor(col * cellWidth);
      const endX = Math.min(width, Math.ceil((col + 1) * cellWidth));
      const startY = Math.floor(row * cellHeight);
      const endY = Math.min(height, Math.ceil((row + 1) * cellHeight));
      let opaqueCount = 0;
      let subjectCount = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const key = y * width + x;
          const alpha = data[key * 4 + 3];
          if (alpha < 32) continue;
          opaqueCount++;
          if (!external[key]) subjectCount++;
        }
      }

      const centerX = Math.min(width - 1, Math.max(0, Math.floor((startX + endX) / 2)));
      const centerY = Math.min(height - 1, Math.max(0, Math.floor((startY + endY) / 2)));
      const centerKey = centerY * width + centerX;
      const centerIsSubject = data[centerKey * 4 + 3] >= 32 && !external[centerKey];
      const subjectCoverage = opaqueCount > 0 ? subjectCount / opaqueCount : 0;

      subjectMaskGrid[row][col] = centerIsSubject || subjectCoverage >= 0.35;
    }
  }

  return subjectMaskGrid;
}

async function removeBackgroundFromPixelData(
  sourcePixelData: MappedPixel[][],
  dimensions: { N: number; M: number },
  imageSrc: string
): Promise<MappedPixel[][]> {
  const { N, M } = dimensions;
  const borderCounts = new Map<string, number>();

  const countBorderCell = (row: number, col: number) => {
    const cell = sourcePixelData[row]?.[col];
    if (!cell || cell.isExternal || cell.key === TRANSPARENT_KEY) return;
    borderCounts.set(cell.key, (borderCounts.get(cell.key) || 0) + 1);
  };

  for (let col = 0; col < N; col++) {
    countBorderCell(0, col);
    if (M > 1) countBorderCell(M - 1, col);
  }
  for (let row = 1; row < M - 1; row++) {
    countBorderCell(row, 0);
    if (N > 1) countBorderCell(row, N - 1);
  }

  if (borderCounts.size === 0) return clonePixelData(sourcePixelData);

  let targetKey = '';
  let maxCount = -1;
  borderCounts.forEach((count, key) => {
    if (count > maxCount) {
      maxCount = count;
      targetKey = key;
    }
  });

  const newPixelData = clonePixelData(sourcePixelData);
  let usedSubjectMask = false;

  try {
    const subjectMaskGrid = await calculateSubjectMaskGridFromImage(imageSrc, dimensions);
    for (let row = 0; row < M; row++) {
      for (let col = 0; col < N; col++) {
        const cell = newPixelData[row][col];
        if (!cell || cell.isExternal || cell.key === TRANSPARENT_KEY || cell.key !== targetKey) continue;
        newPixelData[row][col] = subjectMaskGrid[row]?.[col]
          ? { ...cell, isExternal: false }
          : { ...transparentColorData };
      }
    }
    usedSubjectMask = true;
  } catch (error) {
    console.warn('批量主体 mask 计算失败，回退到边缘洪水填充去背景:', error);
  }

  if (usedSubjectMask) return newPixelData;

  const visited = Array(M).fill(null).map(() => Array(N).fill(false));
  const stack: { row: number; col: number }[] = [];

  const pushIfTarget = (row: number, col: number) => {
    if (row < 0 || row >= M || col < 0 || col >= N || visited[row][col]) return;
    const cell = newPixelData[row][col];
    if (!cell || cell.isExternal || cell.key !== targetKey) return;
    visited[row][col] = true;
    stack.push({ row, col });
  };

  for (let col = 0; col < N; col++) {
    pushIfTarget(0, col);
    if (M > 1) pushIfTarget(M - 1, col);
  }
  for (let row = 1; row < M - 1; row++) {
    pushIfTarget(row, 0);
    if (N > 1) pushIfTarget(row, N - 1);
  }

  while (stack.length > 0) {
    const { row, col } = stack.pop()!;
    newPixelData[row][col] = { ...transparentColorData };
    pushIfTarget(row - 1, col);
    pushIfTarget(row + 1, col);
    pushIfTarget(row, col - 1);
    pushIfTarget(row, col + 1);
  }

  return newPixelData;
}

export async function generatePatternFromImage(
  imageSrc: string,
  options: PatternGenerationOptions
): Promise<PatternGenerationResult> {
  const palette = buildDefaultBeadPalette(options.selectedColorSystem);
  if (palette.length === 0) {
    throw new Error('当前色板为空，无法生成图纸');
  }

  const img = await loadImageElement(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('无法创建图片处理画布');
  }

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const N = Math.min(300, Math.max(10, Math.round(options.granularity)));
  const aspectRatio = canvas.height / canvas.width;
  const M = Math.max(1, Math.round(N * aspectRatio));
  const dimensions = { N, M };
  const fallbackColor = palette.find((color) => color.hex.toUpperCase() === '#FFFFFF') ?? palette[0];
  const initialData = calculatePixelGrid(
    ctx,
    canvas.width,
    canvas.height,
    N,
    M,
    palette,
    options.pixelationMode,
    fallbackColor
  );
  const mergedData = mergeSimilarColors(initialData, dimensions, palette, options.similarityThreshold);
  const limitedData = limitColorCount(mergedData, dimensions, palette, options.maxColorCount);
  const backgroundRemovedData = await removeBackgroundFromPixelData(limitedData, dimensions, imageSrc);
  const {
    mappedPixelData: finalData,
    gridDimensions: croppedDimensions,
  } = cropPixelDataToContent(backgroundRemovedData, 1);
  const stats = calculatePatternStats(finalData);

  return {
    mappedPixelData: finalData,
    gridDimensions: croppedDimensions,
    ...stats,
  };
}

export async function renderPatternThumbnailUrl(
  result: PatternGenerationResult,
  maxSide = 680
): Promise<string> {
  const { N, M } = result.gridDimensions;
  const cellSize = Math.max(2, Math.min(10, Math.floor(maxSide / Math.max(N, M))));
  const canvas = document.createElement('canvas');
  canvas.width = N * cellSize;
  canvas.height = M * cellSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建预览画布');

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < M; row++) {
    for (let col = 0; col < N; col++) {
      const cell = result.mappedPixelData[row][col];
      if (!cell || cell.isExternal || cell.key === TRANSPARENT_KEY) continue;
      ctx.fillStyle = cell.color;
      ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((resultBlob) => {
      if (resultBlob) {
        resolve(resultBlob);
      } else {
        reject(new Error('预览图生成失败'));
      }
    }, 'image/png');
  });

  return URL.createObjectURL(blob);
}
