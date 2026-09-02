import assert from 'node:assert/strict';
import test from 'node:test';

type RgbColor = { r: number; g: number; b: number };
type PaletteColor = { key: string; hex: string; rgb: RgbColor };
type MappedPixel = { key: string; color: string; isExternal?: boolean };

type PatternColorProcessingModule = {
  calculateQuantizedDominantColor?: (
    data: Uint8ClampedArray,
    imageWidth: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ) => RgbColor | null;
  consolidatePatternColors?: (
    sourceData: MappedPixel[][],
    dimensions: { N: number; M: number },
    palette: PaletteColor[],
    options: { similarityThreshold: number; maxColorCount: number },
  ) => MappedPixel[][];
};

async function loadColorProcessing() {
  let loadedModule: PatternColorProcessingModule = {};
  const modulePath = './patternColorProcessing.ts';

  try {
    loadedModule = await import(modulePath);
  } catch {
    // The first TDD run intentionally happens before the implementation exists.
  }

  assert.equal(
    typeof loadedModule.calculateQuantizedDominantColor,
    'function',
    'calculateQuantizedDominantColor should be implemented',
  );
  assert.equal(
    typeof loadedModule.consolidatePatternColors,
    'function',
    'consolidatePatternColors should be implemented',
  );

  return {
    calculateQuantizedDominantColor: loadedModule.calculateQuantizedDominantColor!,
    consolidatePatternColors: loadedModule.consolidatePatternColors!,
  };
}

const greenPalette: PaletteColor[] = [
  { key: 'G1', hex: '#65E2A6', rgb: { r: 101, g: 226, b: 166 } },
  { key: 'G2', hex: '#3DAF80', rgb: { r: 61, g: 175, b: 128 } },
  { key: 'K1', hex: '#111111', rgb: { r: 17, g: 17, b: 17 } },
];

function solidGrid(size: number, color: PaletteColor): MappedPixel[][] {
  return Array.from({ length: size }, () => (
    Array.from({ length: size }, () => ({ key: color.key, color: color.hex }))
  ));
}

test('chooses the dominant color family instead of the first unique photo pixel', async () => {
  const { calculateQuantizedDominantColor } = await loadColorProcessing();
  const rgba = new Uint8ClampedArray([
    20, 60, 20, 255,
    100, 200, 120, 255,
    101, 201, 121, 255,
    102, 202, 122, 255,
  ]);

  assert.deepEqual(
    calculateQuantizedDominantColor(rgba, 4, 0, 0, 4, 1),
    { r: 101, g: 201, b: 121 },
  );
});

test('keeps nearby photo colors together when they straddle a quantization boundary', async () => {
  const { calculateQuantizedDominantColor } = await loadColorProcessing();
  const rgba = new Uint8ClampedArray([
    20, 20, 20, 255,
    20, 20, 20, 255,
    20, 20, 20, 255,
    95, 160, 95, 255,
    95, 160, 95, 255,
    96, 160, 95, 255,
    96, 160, 95, 255,
  ]);

  assert.deepEqual(
    calculateQuantizedDominantColor(rgba, 7, 0, 0, 7, 1),
    { r: 96, g: 160, b: 95 },
  );
});

test('removes an isolated green shade surrounded by one local color', async () => {
  const { consolidatePatternColors } = await loadColorProcessing();
  const grid = solidGrid(5, greenPalette[0]);
  grid[2][2] = { key: greenPalette[1].key, color: greenPalette[1].hex };

  const result = consolidatePatternColors(
    grid,
    { N: 5, M: 5 },
    greenPalette,
    { similarityThreshold: 0, maxColorCount: 3 },
  );

  assert.equal(result[2][2].key, 'G1');
});

test('removes isolated noise for non-green color families too', async () => {
  const { consolidatePatternColors } = await loadColorProcessing();
  const redPalette: PaletteColor[] = [
    { key: 'R1', hex: '#F551A2', rgb: { r: 245, g: 81, b: 162 } },
    { key: 'R2', hex: '#E8649E', rgb: { r: 232, g: 100, b: 158 } },
  ];
  const grid = solidGrid(5, redPalette[0]);
  grid[2][2] = { key: redPalette[1].key, color: redPalette[1].hex };

  const result = consolidatePatternColors(
    grid,
    { N: 5, M: 5 },
    redPalette,
    { similarityThreshold: 0, maxColorCount: 2 },
  );

  assert.equal(result[2][2].key, 'R1');
});

test('removes a three-cell noise island at the default grid size', async () => {
  const { consolidatePatternColors } = await loadColorProcessing();
  const grid = solidGrid(52, greenPalette[0]);
  grid[26][25] = { key: greenPalette[1].key, color: greenPalette[1].hex };
  grid[26][26] = { key: greenPalette[1].key, color: greenPalette[1].hex };
  grid[26][27] = { key: greenPalette[1].key, color: greenPalette[1].hex };

  const result = consolidatePatternColors(
    grid,
    { N: 52, M: 52 },
    greenPalette,
    { similarityThreshold: 0, maxColorCount: 3 },
  );

  assert.equal(result[26][25].key, 'G1');
  assert.equal(result[26][26].key, 'G1');
  assert.equal(result[26][27].key, 'G1');
});

test('preserves an isolated high-contrast detail such as an eye or highlight', async () => {
  const { consolidatePatternColors } = await loadColorProcessing();
  const grid = solidGrid(5, greenPalette[0]);
  grid[2][2] = { key: greenPalette[2].key, color: greenPalette[2].hex };

  const result = consolidatePatternColors(
    grid,
    { N: 5, M: 5 },
    greenPalette,
    { similarityThreshold: 0, maxColorCount: 3 },
  );

  assert.equal(result[2][2].key, 'K1');
});

test('preserves a subtle pale highlight that is a local lightness peak', async () => {
  const { consolidatePatternColors } = await loadColorProcessing();
  const palePalette: PaletteColor[] = [
    { key: 'P1', hex: '#FAF4C8', rgb: { r: 250, g: 244, b: 200 } },
    { key: 'W1', hex: '#FFFFFF', rgb: { r: 255, g: 255, b: 255 } },
  ];
  const grid = solidGrid(5, palePalette[0]);
  grid[2][2] = { key: palePalette[1].key, color: palePalette[1].hex };

  const result = consolidatePatternColors(
    grid,
    { N: 5, M: 5 },
    palePalette,
    { similarityThreshold: 0, maxColorCount: 2 },
  );

  assert.equal(result[2][2].key, 'W1');
});

test('preserves contiguous color bands used for smooth shading transitions', async () => {
  const { consolidatePatternColors } = await loadColorProcessing();
  const gradientPalette: PaletteColor[] = [
    greenPalette[0],
    greenPalette[1],
    { key: 'G3', hex: '#27523A', rgb: { r: 39, g: 82, b: 58 } },
  ];
  const grid = Array.from({ length: 5 }, () => (
    Array.from({ length: 5 }, (_, col) => {
      const color = col < 2 ? gradientPalette[0] : col < 4 ? gradientPalette[1] : gradientPalette[2];
      return { key: color.key, color: color.hex };
    })
  ));

  const result = consolidatePatternColors(
    grid,
    { N: 5, M: 5 },
    gradientPalette,
    { similarityThreshold: 0, maxColorCount: 3 },
  );

  assert.deepEqual(result, grid);
});

test('preserves small details next to transparent subject boundaries', async () => {
  const { consolidatePatternColors } = await loadColorProcessing();
  const grid = solidGrid(5, greenPalette[0]);
  grid[2][2] = { key: greenPalette[1].key, color: greenPalette[1].hex };
  grid[1][2] = { key: 'ERASE', color: 'transparent', isExternal: true };

  const result = consolidatePatternColors(
    grid,
    { N: 5, M: 5 },
    greenPalette,
    { similarityThreshold: 0, maxColorCount: 3 },
  );

  assert.equal(result[2][2].key, 'G2');
});

test('keeps the requested maximum color count after perceptual replacement', async () => {
  const { consolidatePatternColors } = await loadColorProcessing();
  const palette: PaletteColor[] = [
    greenPalette[0],
    greenPalette[1],
    greenPalette[2],
    { key: 'G3', hex: '#27523A', rgb: { r: 39, g: 82, b: 58 } },
  ];
  const grid = Array.from({ length: 5 }, (_, row) => (
    Array.from({ length: 5 }, (_, col) => {
      const color = palette[(row + col) % palette.length];
      return { key: color.key, color: color.hex };
    })
  ));

  const result = consolidatePatternColors(
    grid,
    { N: 5, M: 5 },
    palette,
    { similarityThreshold: 0, maxColorCount: 2 },
  );
  const usedKeys = new Set(result.flat().map((cell) => cell.key));

  assert.ok(usedKeys.size <= 2);
});
