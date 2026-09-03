import type { ColorSystem } from './colorSystemUtils';
import type { MappedPixel, PaletteColor, PixelationMode } from './pixelation';

export type PatternPresetId = 'economy' | 'balanced' | 'portrait' | 'detailed' | 'large';

export type PatternPreset = {
  id: PatternPresetId;
  label: string;
  granularity: number;
  maxColorCount: number;
  similarityThreshold: number;
};

export type PatternGenerationOptions = {
  granularity: number;
  similarityThreshold: number;
  maxColorCount: number;
  brightness: number;
  horizontalMirror: boolean;
  verticalMirror: boolean;
  autoRemoveBackground: boolean;
  outline: boolean;
  pixelationMode: PixelationMode;
  selectedColorSystem: ColorSystem;
};

export const PATTERN_PRESETS: readonly PatternPreset[] = [
  { id: 'economy', label: '省豆', granularity: 32, maxColorCount: 10, similarityThreshold: 18 },
  { id: 'balanced', label: '均衡', granularity: 52, maxColorCount: 16, similarityThreshold: 14 },
  { id: 'portrait', label: '头像', granularity: 64, maxColorCount: 18, similarityThreshold: 12 },
  { id: 'detailed', label: '精细', granularity: 104, maxColorCount: 24, similarityThreshold: 10 },
  { id: 'large', label: '大图', granularity: 156, maxColorCount: 32, similarityThreshold: 8 },
];

export const DEFAULT_PATTERN_GENERATION_OPTIONS: PatternGenerationOptions = {
  granularity: 52,
  similarityThreshold: 14,
  maxColorCount: 16,
  brightness: 0,
  horizontalMirror: false,
  verticalMirror: false,
  autoRemoveBackground: true,
  outline: false,
  pixelationMode: 'dominant' as PixelationMode,
  selectedColorSystem: '通用221色',
};

const colorSystems: readonly ColorSystem[] = ['通用221色', 'MARD', 'COCO', '漫漫', '盼盼', '咪小窝'];

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function isRetiredBatchDefault(value: Partial<PatternGenerationOptions>): boolean {
  const hasRedesignedFields = (
    typeof value.brightness === 'number'
    || typeof value.horizontalMirror === 'boolean'
    || typeof value.verticalMirror === 'boolean'
    || typeof value.outline === 'boolean'
  );

  return !hasRedesignedFields
    && value.granularity === 85
    && value.similarityThreshold === 12
    && value.maxColorCount === 8
    && value.pixelationMode === ('dominant' as PixelationMode)
    && value.selectedColorSystem === '通用221色';
}

export function normalizePatternGenerationOptions(
  value: Partial<PatternGenerationOptions> | null | undefined = {},
): PatternGenerationOptions {
  if (value && isRetiredBatchDefault(value)) {
    return { ...DEFAULT_PATTERN_GENERATION_OPTIONS };
  }

  const defaults = DEFAULT_PATTERN_GENERATION_OPTIONS;
  return {
    granularity: clampNumber(value?.granularity, defaults.granularity, 24, 180),
    similarityThreshold: clampNumber(value?.similarityThreshold, defaults.similarityThreshold, 0, 100),
    maxColorCount: clampNumber(value?.maxColorCount, defaults.maxColorCount, 1, 221),
    brightness: clampNumber(value?.brightness, defaults.brightness, -50, 50),
    horizontalMirror: typeof value?.horizontalMirror === 'boolean' ? value.horizontalMirror : defaults.horizontalMirror,
    verticalMirror: typeof value?.verticalMirror === 'boolean' ? value.verticalMirror : defaults.verticalMirror,
    autoRemoveBackground: typeof value?.autoRemoveBackground === 'boolean'
      ? value.autoRemoveBackground
      : defaults.autoRemoveBackground,
    outline: typeof value?.outline === 'boolean' ? value.outline : defaults.outline,
    pixelationMode: value?.pixelationMode === ('average' as PixelationMode)
      ? value.pixelationMode
      : defaults.pixelationMode,
    selectedColorSystem: colorSystems.includes(value?.selectedColorSystem as ColorSystem)
      ? value!.selectedColorSystem as ColorSystem
      : defaults.selectedColorSystem,
  };
}

export function findMatchingPatternPreset(
  options: Pick<PatternGenerationOptions, 'granularity' | 'maxColorCount' | 'similarityThreshold'>,
): PatternPresetId | null {
  return PATTERN_PRESETS.find((preset) => (
    preset.granularity === options.granularity
    && preset.maxColorCount === options.maxColorCount
    && preset.similarityThreshold === options.similarityThreshold
  ))?.id ?? null;
}

export function adjustPatternBrightness(
  pixels: Uint8ClampedArray,
  percentage: number,
): Uint8ClampedArray {
  const adjusted = new Uint8ClampedArray(pixels);
  const delta = Math.round(255 * (Math.min(50, Math.max(-50, percentage)) / 100));

  for (let index = 0; index < adjusted.length; index += 4) {
    adjusted[index] = Math.max(0, Math.min(255, adjusted[index] + delta));
    adjusted[index + 1] = Math.max(0, Math.min(255, adjusted[index + 1] + delta));
    adjusted[index + 2] = Math.max(0, Math.min(255, adjusted[index + 2] + delta));
  }

  return adjusted;
}

export function applyPatternMirrors(
  grid: MappedPixel[][],
  options: Pick<PatternGenerationOptions, 'horizontalMirror' | 'verticalMirror'>,
): MappedPixel[][] {
  let transformed = grid.map((row) => row.map((cell) => ({ ...cell })));

  if (options.horizontalMirror) {
    transformed = transformed.map((row) => row.slice().reverse());
  }
  if (options.verticalMirror) {
    transformed = transformed.slice().reverse();
  }

  return transformed;
}

export function applyPatternOutline(
  grid: MappedPixel[][],
  subjectGrid: MappedPixel[][],
  dimensions: { N: number; M: number },
  palette: PaletteColor[],
): MappedPixel[][] {
  if (palette.length === 0) return grid.map((row) => row.map((cell) => ({ ...cell })));

  const outlineColor = palette.reduce((darkest, color) => {
    const luminance = 0.2126 * color.rgb.r + 0.7152 * color.rgb.g + 0.0722 * color.rgb.b;
    const darkestLuminance = 0.2126 * darkest.rgb.r + 0.7152 * darkest.rgb.g + 0.0722 * darkest.rgb.b;
    return luminance < darkestLuminance ? color : darkest;
  }, palette[0]);
  const outlined = grid.map((row) => row.map((cell) => ({ ...cell })));
  const neighbors = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1],
  ];
  const isSubject = (cell?: MappedPixel) => Boolean(cell && !cell.isExternal && cell.key !== 'ERASE');

  for (let row = 0; row < dimensions.M; row++) {
    for (let col = 0; col < dimensions.N; col++) {
      if (isSubject(subjectGrid[row]?.[col])) continue;

      if (neighbors.some(([rowOffset, colOffset]) => (
        isSubject(subjectGrid[row + rowOffset]?.[col + colOffset])
      ))) {
        outlined[row][col] = {
          key: outlineColor.key,
          color: outlineColor.hex,
          isExternal: false,
        };
      }
    }
  }

  return outlined;
}
