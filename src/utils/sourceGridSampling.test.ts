import assert from 'node:assert/strict';
import test from 'node:test';

type RgbColor = { r: number; g: number; b: number };
type SamplingModule = {
  calculateRepresentativeRgbGrid?: (
    data: Uint8ClampedArray,
    imageWidth: number,
    imageHeight: number,
    columns: number,
    rows: number,
    mode: 'dominant' | 'average',
  ) => Array<Array<RgbColor | null>>;
};

async function loadSamplingModule() {
  let loadedModule: SamplingModule = {};
  try {
    loadedModule = await import('./sourceGridSampling.ts');
  } catch {
    // The first TDD run intentionally happens before the implementation exists.
  }

  assert.equal(
    typeof loadedModule.calculateRepresentativeRgbGrid,
    'function',
    'calculateRepresentativeRgbGrid should be implemented',
  );
  return loadedModule.calculateRepresentativeRgbGrid!;
}

test('samples an existing bead cell once when a finer output grid would split its reflection', async () => {
  const calculateRepresentativeRgbGrid = await loadSamplingModule();
  const width = 60;
  const height = 60;
  const pitch = 10;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const green = { r: 80, g: 180, b: 110 };
  const yellow = { r: 235, g: 210, b: 45 };
  const black = { r: 8, g: 8, b: 8 };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isGridLine = x % pitch === 0 || y % pitch === 0;
      const isReflection = x >= 21 && x <= 24 && y >= 21 && y <= 24;
      const isBlackBead = Math.floor(x / pitch) === 3 && Math.floor(y / pitch) === 3;
      const color = isGridLine || isBlackBead ? black : isReflection ? yellow : green;
      const index = (y * width + x) * 4;
      rgba[index] = color.r;
      rgba[index + 1] = color.g;
      rgba[index + 2] = color.b;
      rgba[index + 3] = 255;
    }
  }

  const result = calculateRepresentativeRgbGrid(
    rgba,
    width,
    height,
    12,
    12,
    'dominant',
  );

  assert.deepEqual(
    [result[4][4], result[4][5], result[5][4], result[5][5]],
    [green, green, green, green],
  );
  assert.deepEqual(
    [result[6][6], result[6][7], result[7][6], result[7][7]],
    [black, black, black, black],
  );
});

test('keeps normal non-periodic image regions independent', async () => {
  const calculateRepresentativeRgbGrid = await loadSamplingModule();
  const width = 20;
  const height = 10;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const red = { r: 220, g: 40, b: 50 };
  const blue = { r: 30, g: 90, b: 220 };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = x < width / 2 ? red : blue;
      const index = (y * width + x) * 4;
      rgba[index] = color.r;
      rgba[index + 1] = color.g;
      rgba[index + 2] = color.b;
      rgba[index + 3] = 255;
    }
  }

  const result = calculateRepresentativeRgbGrid(rgba, width, height, 2, 1, 'dominant');

  assert.deepEqual(result, [[red, blue]]);
});

test('does not mistake one black cross for a repeating source grid', async () => {
  const calculateRepresentativeRgbGrid = await loadSamplingModule();
  const width = 60;
  const height = 60;
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = x === 30 || y === 30 ? 0 : 255;
      const index = (y * width + x) * 4;
      rgba[index] = value;
      rgba[index + 1] = value;
      rgba[index + 2] = value;
      rgba[index + 3] = 255;
    }
  }

  const result = calculateRepresentativeRgbGrid(rgba, width, height, 12, 12, 'average');

  assert.ok(result[6][6] !== null && result[6][6]!.r < 255);
  assert.deepEqual(result[0][0], { r: 255, g: 255, b: 255 });
});

test('keeps transparent target subdivisions empty inside a detected source cell', async () => {
  const calculateRepresentativeRgbGrid = await loadSamplingModule();
  const width = 60;
  const height = 60;
  const pitch = 10;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const green = { r: 80, g: 180, b: 110 };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cellX = Math.floor(x / pitch);
      const cellY = Math.floor(y / pitch);
      const transparentHalf = cellX === 2 && cellY === 2 && x >= 25;
      const isGridLine = x % pitch === 0 || y % pitch === 0;
      const value = isGridLine ? 8 : green.r;
      const index = (y * width + x) * 4;
      rgba[index] = value;
      rgba[index + 1] = isGridLine ? 8 : green.g;
      rgba[index + 2] = isGridLine ? 8 : green.b;
      rgba[index + 3] = transparentHalf ? 0 : 255;
    }
  }

  const result = calculateRepresentativeRgbGrid(rgba, width, height, 12, 12, 'dominant');

  assert.deepEqual(result[4][4], green);
  assert.equal(result[4][5], null);
  assert.deepEqual(result[5][4], green);
  assert.equal(result[5][5], null);
});
