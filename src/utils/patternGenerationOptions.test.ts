import assert from 'node:assert/strict';
import test from 'node:test';

type MappedPixel = { key: string; color: string; isExternal?: boolean };

type NormalizeOptions = (value?: Record<string, unknown>) => Record<string, unknown>;
type AdjustBrightness = (pixels: Uint8ClampedArray, percentage: number) => Uint8ClampedArray;
type TransformGrid = (
  grid: MappedPixel[][],
  options: { horizontalMirror: boolean; verticalMirror: boolean },
) => MappedPixel[][];
type PaletteColor = { key: string; hex: string; rgb: { r: number; g: number; b: number } };
type OutlineGrid = (
  grid: MappedPixel[][],
  subjectGrid: MappedPixel[][],
  dimensions: { N: number; M: number },
  palette: PaletteColor[],
) => MappedPixel[][];

type PatternGenerationOptionsModule = {
  DEFAULT_PATTERN_GENERATION_OPTIONS?: Record<string, unknown>;
  normalizePatternGenerationOptions?: NormalizeOptions;
  adjustPatternBrightness?: AdjustBrightness;
  applyPatternMirrors?: TransformGrid;
  applyPatternOutline?: OutlineGrid;
};

async function loadGenerationOptions() {
  let loadedModule: PatternGenerationOptionsModule = {};
  const modulePath = './patternGenerationOptions.ts';

  try {
    loadedModule = await import(modulePath);
  } catch {
    // The first TDD run intentionally happens before the shared settings module exists.
  }

  return loadedModule;
}

test('new batch jobs start with the same balanced settings as the single-image tool', async () => {
  const settings = await loadGenerationOptions();
  assert.deepEqual(settings.DEFAULT_PATTERN_GENERATION_OPTIONS, {
    granularity: 52,
    similarityThreshold: 14,
    maxColorCount: 16,
    brightness: 0,
    horizontalMirror: false,
    verticalMirror: false,
    autoRemoveBackground: true,
    outline: false,
    pixelationMode: 'dominant',
    selectedColorSystem: '通用221色',
  });
});

test('old batch settings gain the new processing defaults without losing valid choices', async () => {
  const settings = await loadGenerationOptions();
  const normalize = settings.normalizePatternGenerationOptions;
  assert.equal(typeof normalize, 'function');

  assert.deepEqual(normalize?.({
    granularity: 64,
    similarityThreshold: 12,
    maxColorCount: 18,
    pixelationMode: 'average',
    selectedColorSystem: 'COCO',
    autoRemoveBackground: false,
  }), {
    granularity: 64,
    similarityThreshold: 12,
    maxColorCount: 18,
    brightness: 0,
    horizontalMirror: false,
    verticalMirror: false,
    autoRemoveBackground: false,
    outline: false,
    pixelationMode: 'average',
    selectedColorSystem: 'COCO',
  });
});

test('the retired 85 by 8 batch default migrates to the balanced tool preset', async () => {
  const settings = await loadGenerationOptions();
  const normalize = settings.normalizePatternGenerationOptions;
  assert.equal(typeof normalize, 'function');

  const normalized = normalize?.({
    granularity: 85,
    similarityThreshold: 12,
    maxColorCount: 8,
    pixelationMode: 'dominant',
    selectedColorSystem: '通用221色',
    autoRemoveBackground: true,
  });

  assert.equal(normalized?.granularity, 52);
  assert.equal(normalized?.similarityThreshold, 14);
  assert.equal(normalized?.maxColorCount, 16);
});

test('batch numeric settings use the same limits as the redesigned tool controls', async () => {
  const settings = await loadGenerationOptions();
  const normalize = settings.normalizePatternGenerationOptions;
  assert.equal(typeof normalize, 'function');

  const normalized = normalize?.({
    granularity: 999,
    similarityThreshold: -10,
    maxColorCount: 0,
    brightness: 80,
  });

  assert.equal(normalized?.granularity, 180);
  assert.equal(normalized?.similarityThreshold, 0);
  assert.equal(normalized?.maxColorCount, 1);
  assert.equal(normalized?.brightness, 50);
});

test('brightness adjustment changes RGB channels but preserves alpha', async () => {
  const settings = await loadGenerationOptions();
  const adjust = settings.adjustPatternBrightness;
  assert.equal(typeof adjust, 'function');

  assert.deepEqual(
    Array.from(adjust?.(new Uint8ClampedArray([10, 100, 250, 123]), 20) ?? []),
    [61, 151, 255, 123],
  );
});

test('batch mirror processing follows the single-image tool directions', async () => {
  const settings = await loadGenerationOptions();
  const transform = settings.applyPatternMirrors;
  assert.equal(typeof transform, 'function');

  const cell = (key: string): MappedPixel => ({ key, color: '#000000' });
  const source = [
    [cell('A'), cell('B')],
    [cell('C'), cell('D')],
  ];

  assert.deepEqual(
    transform?.(source, { horizontalMirror: true, verticalMirror: false }).map((row) => row.map((item) => item.key)),
    [['B', 'A'], ['D', 'C']],
  );
  assert.deepEqual(
    transform?.(source, { horizontalMirror: false, verticalMirror: true }).map((row) => row.map((item) => item.key)),
    [['C', 'D'], ['A', 'B']],
  );
});

test('outline processing adds the darkest bead color only around the detected subject', async () => {
  const settings = await loadGenerationOptions();
  const outline = settings.applyPatternOutline;
  assert.equal(typeof outline, 'function');

  const white = (): MappedPixel => ({ key: 'W', color: '#FFFFFF' });
  const transparent = (): MappedPixel => ({ key: 'ERASE', color: 'transparent', isExternal: true });
  const source = Array.from({ length: 3 }, () => Array.from({ length: 3 }, white));
  source[1][1] = { key: 'G', color: '#00AA00' };
  const subject = Array.from({ length: 3 }, () => Array.from({ length: 3 }, transparent));
  subject[1][1] = { key: 'G', color: '#00AA00' };

  const result = outline?.(source, subject, { N: 3, M: 3 }, [
    { key: 'W', hex: '#FFFFFF', rgb: { r: 255, g: 255, b: 255 } },
    { key: 'K', hex: '#111111', rgb: { r: 17, g: 17, b: 17 } },
  ]);

  assert.deepEqual(result?.map((row) => row.map((cell) => cell.key)), [
    ['K', 'K', 'K'],
    ['K', 'G', 'K'],
    ['K', 'K', 'K'],
  ]);
});
