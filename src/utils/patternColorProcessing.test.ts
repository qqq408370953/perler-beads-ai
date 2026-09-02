import assert from 'node:assert/strict';
import test from 'node:test';

type RgbColor = { r: number; g: number; b: number };
type PaletteColor = { key: string; hex: string; rgb: RgbColor };
type MappedPixel = { key: string; color: string; isExternal?: boolean; sourceRgb?: RgbColor };

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
  preparePatternColors?: (
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
  assert.equal(
    typeof loadedModule.preparePatternColors,
    'function',
    'preparePatternColors should be implemented',
  );

  return {
    calculateQuantizedDominantColor: loadedModule.calculateQuantizedDominantColor!,
    consolidatePatternColors: loadedModule.consolidatePatternColors!,
    preparePatternColors: loadedModule.preparePatternColors!,
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

test('keeps a distinct color family instead of spending every slot on similar frequent shades', async () => {
  const { preparePatternColors } = await loadColorProcessing();
  const palette: PaletteColor[] = [
    { key: 'G1', hex: '#52B978', rgb: { r: 82, g: 185, b: 120 } },
    { key: 'G2', hex: '#62C989', rgb: { r: 98, g: 201, b: 137 } },
    { key: 'G3', hex: '#43A96B', rgb: { r: 67, g: 169, b: 107 } },
    { key: 'R1', hex: '#E95862', rgb: { r: 233, g: 88, b: 98 } },
  ];
  const keys = [
    ...Array(9).fill('G1'),
    ...Array(8).fill('G2'),
    ...Array(7).fill('G3'),
    ...Array(3).fill('R1'),
  ];
  const grid = [keys.map((key) => {
    const color = palette.find((candidate) => candidate.key === key)!;
    return { key: color.key, color: color.hex };
  })];

  const result = preparePatternColors(
    grid,
    { N: keys.length, M: 1 },
    palette,
    { similarityThreshold: 0, maxColorCount: 3 },
  );
  const usedKeys = new Set(result.flat().map((cell) => cell.key));

  assert.equal(usedKeys.size, 3);
  assert.ok(usedKeys.has('R1'));
});

test('removes a narrow reflection stripe when source evidence favors the surrounding bead color', async () => {
  const { consolidatePatternColors } = await loadColorProcessing();
  const palette: PaletteColor[] = [
    { key: 'G1', hex: '#50B46E', rgb: { r: 80, g: 180, b: 110 } },
    { key: 'Y1', hex: '#96BE32', rgb: { r: 150, g: 190, b: 50 } },
  ];
  const baseSource = { r: 82, g: 179, b: 112 };
  const reflectionSource = { r: 108, g: 185, b: 92 };
  const grid = Array.from({ length: 9 }, () => (
    Array.from({ length: 9 }, () => ({
      key: 'G1',
      color: '#50B46E',
      sourceRgb: baseSource,
    }))
  ));
  for (let row = 2; row <= 6; row++) {
    grid[row][4] = { key: 'Y1', color: '#96BE32', sourceRgb: reflectionSource };
  }

  const result = consolidatePatternColors(
    grid,
    { N: 9, M: 9 },
    palette,
    { similarityThreshold: 0, maxColorCount: 2 },
  );

  for (let row = 2; row <= 6; row++) {
    assert.equal(result[row][4].key, 'G1');
  }
});

test('does not spend a color slot on a one-cell far-color outlier', async () => {
  const { preparePatternColors } = await loadColorProcessing();
  const palette: PaletteColor[] = [
    { key: 'G1', hex: '#52B978', rgb: { r: 82, g: 185, b: 120 } },
    { key: 'G2', hex: '#357D58', rgb: { r: 53, g: 125, b: 88 } },
    { key: 'M1', hex: '#E83BE4', rgb: { r: 232, g: 59, b: 228 } },
  ];
  const keys = [
    ...Array(20).fill('G1'),
    ...Array(10).fill('G2'),
    'M1',
  ];
  const grid = [keys.map((key) => {
    const color = palette.find((candidate) => candidate.key === key)!;
    return { key: color.key, color: color.hex };
  })];

  const result = preparePatternColors(
    grid,
    { N: keys.length, M: 1 },
    palette,
    { similarityThreshold: 0, maxColorCount: 2 },
  );
  const usedKeys = new Set(result.flat().map((cell) => cell.key));

  assert.deepEqual([...usedKeys].sort(), ['G1', 'G2']);
});

test('preserves a narrow intentional outline when source pixels strongly support black', async () => {
  const { consolidatePatternColors } = await loadColorProcessing();
  const palette: PaletteColor[] = [
    { key: 'G1', hex: '#50B46E', rgb: { r: 80, g: 180, b: 110 } },
    { key: 'K1', hex: '#080808', rgb: { r: 8, g: 8, b: 8 } },
  ];
  const grid = Array.from({ length: 9 }, () => (
    Array.from({ length: 9 }, () => ({
      key: 'G1',
      color: '#50B46E',
      sourceRgb: { r: 82, g: 179, b: 112 },
    }))
  ));
  for (let row = 2; row <= 6; row++) {
    grid[row][4] = { key: 'K1', color: '#080808', sourceRgb: { r: 10, g: 9, b: 8 } };
  }

  const result = consolidatePatternColors(
    grid,
    { N: 9, M: 9 },
    palette,
    { similarityThreshold: 0, maxColorCount: 2 },
  );

  for (let row = 2; row <= 6; row++) {
    assert.equal(result[row][4].key, 'K1');
  }
});

test('preserves a source-supported subtle highlight', async () => {
  const { consolidatePatternColors } = await loadColorProcessing();
  const palette: PaletteColor[] = [
    { key: 'B1', hex: '#C8C8C8', rgb: { r: 200, g: 200, b: 200 } },
    { key: 'H1', hex: '#D0D0D0', rgb: { r: 208, g: 208, b: 208 } },
  ];
  const grid = Array.from({ length: 7 }, () => (
    Array.from({ length: 7 }, () => ({
      key: 'B1',
      color: '#C8C8C8',
      sourceRgb: { r: 200, g: 200, b: 200 },
    }))
  ));
  grid[3][3] = { key: 'H1', color: '#D0D0D0', sourceRgb: { r: 208, g: 208, b: 208 } };

  const result = consolidatePatternColors(
    grid,
    { N: 7, M: 7 },
    palette,
    { similarityThreshold: 0, maxColorCount: 2 },
  );

  assert.equal(result[3][3].key, 'H1');
});

test('removes a two-cell-wide reflection stripe when source evidence favors its surroundings', async () => {
  const { consolidatePatternColors } = await loadColorProcessing();
  const palette: PaletteColor[] = [
    { key: 'G1', hex: '#50B46E', rgb: { r: 80, g: 180, b: 110 } },
    { key: 'Y1', hex: '#96BE32', rgb: { r: 150, g: 190, b: 50 } },
  ];
  const grid = Array.from({ length: 10 }, () => (
    Array.from({ length: 10 }, () => ({
      key: 'G1',
      color: '#50B46E',
      sourceRgb: { r: 82, g: 179, b: 112 },
    }))
  ));
  for (let row = 2; row <= 7; row++) {
    for (let col = 4; col <= 5; col++) {
      grid[row][col] = {
        key: 'Y1',
        color: '#96BE32',
        sourceRgb: { r: 108, g: 185, b: 92 },
      };
    }
  }

  const result = consolidatePatternColors(
    grid,
    { N: 10, M: 10 },
    palette,
    { similarityThreshold: 0, maxColorCount: 2 },
  );

  for (let row = 2; row <= 7; row++) {
    for (let col = 4; col <= 5; col++) {
      assert.equal(result[row][col].key, 'G1');
    }
  }
});

test('does not let one extreme outlier displace a supported secondary shade', async () => {
  const { preparePatternColors } = await loadColorProcessing();
  const palette: PaletteColor[] = [
    { key: 'W1', hex: '#FFFFFF', rgb: { r: 255, g: 255, b: 255 } },
    { key: 'S1', hex: '#D8D8D8', rgb: { r: 216, g: 216, b: 216 } },
    { key: 'K1', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } },
  ];
  const keys = [
    ...Array(100).fill('W1'),
    ...Array(4).fill('S1'),
    'K1',
  ];
  const grid = [keys.map((key) => {
    const color = palette.find((candidate) => candidate.key === key)!;
    return { key: color.key, color: color.hex };
  })];

  const result = preparePatternColors(
    grid,
    { N: keys.length, M: 1 },
    palette,
    { similarityThreshold: 0, maxColorCount: 2 },
  );
  const usedKeys = new Set(result.flat().map((cell) => cell.key));

  assert.deepEqual([...usedKeys].sort(), ['S1', 'W1']);
});

test('does not let a singleton outlier take a color slot on a small limited grid', async () => {
  const { preparePatternColors } = await loadColorProcessing();
  const palette: PaletteColor[] = [
    { key: 'W1', hex: '#FFFFFF', rgb: { r: 255, g: 255, b: 255 } },
    { key: 'S1', hex: '#D8D8D8', rgb: { r: 216, g: 216, b: 216 } },
    { key: 'K1', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } },
  ];
  const keys = [
    ...Array(60).fill('W1'),
    ...Array(2).fill('S1'),
    'K1',
  ];
  const grid = [keys.map((key) => {
    const color = palette.find((candidate) => candidate.key === key)!;
    return { key: color.key, color: color.hex };
  })];

  const result = preparePatternColors(
    grid,
    { N: keys.length, M: 1 },
    palette,
    { similarityThreshold: 0, maxColorCount: 2 },
  );
  const usedKeys = new Set(result.flat().map((cell) => cell.key));

  assert.deepEqual([...usedKeys].sort(), ['S1', 'W1']);
});

test('keeps a small high-contrast eye when limiting colors on a detailed grid', async () => {
  const { preparePatternColors } = await loadColorProcessing();
  const bodyPalette: PaletteColor[] = Array.from({ length: 24 }, (_, index) => ({
    key: `G${index + 1}`,
    hex: `#${(72 + index).toString(16).padStart(2, '0')}B478`,
    rgb: { r: 72 + index, g: 180, b: 120 },
  }));
  const eyeColor: PaletteColor = {
    key: 'K1',
    hex: '#080808',
    rgb: { r: 8, g: 8, b: 8 },
  };
  const palette = [...bodyPalette, eyeColor];
  const grid = Array.from({ length: 104 }, (_, row) => (
    Array.from({ length: 104 }, (_, col) => {
      const color = bodyPalette[(row * 104 + col) % bodyPalette.length];
      return { key: color.key, color: color.hex, sourceRgb: { ...color.rgb } };
    })
  ));
  for (let row = 50; row < 52; row++) {
    for (let col = 50; col < 54; col++) {
      grid[row][col] = {
        key: eyeColor.key,
        color: eyeColor.hex,
        sourceRgb: { ...eyeColor.rgb },
      };
    }
  }

  const result = preparePatternColors(
    grid,
    { N: 104, M: 104 },
    palette,
    { similarityThreshold: 0, maxColorCount: 24 },
  );
  const usedKeys = new Set(result.flat().map((cell) => cell.key));

  assert.equal(usedKeys.size, 24);
  assert.ok(usedKeys.has('K1'));
});

test('handles a large solid component without overflowing the call stack', async () => {
  const { consolidatePatternColors } = await loadColorProcessing();
  const width = 300;
  const height = 600;
  const grid = Array.from({ length: height }, () => (
    Array.from({ length: width }, () => ({
      key: greenPalette[0].key,
      color: greenPalette[0].hex,
    }))
  ));

  const result = consolidatePatternColors(
    grid,
    { N: width, M: height },
    greenPalette,
    { similarityThreshold: 0, maxColorCount: 3 },
  );

  assert.equal(result.length, height);
  assert.equal(result[0].length, width);
  assert.equal(result[height - 1][width - 1].key, greenPalette[0].key);
});

test('strips source evidence from the finalized pattern grid', async () => {
  const { consolidatePatternColors } = await loadColorProcessing();
  const grid = solidGrid(5, greenPalette[0]).map((row) => row.map((cell) => ({
    ...cell,
    sourceRgb: { ...greenPalette[0].rgb },
  })));

  const result = consolidatePatternColors(
    grid,
    { N: 5, M: 5 },
    greenPalette,
    { similarityThreshold: 0, maxColorCount: 3 },
  );

  assert.equal(result[2][2].sourceRgb, undefined);
});
