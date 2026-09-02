import assert from 'node:assert/strict';
import test from 'node:test';

type ColorCountModule = {
  normalizeColorCountInput?: (
    rawValue: string,
    currentValue: number,
    paletteColorCount: number,
  ) => number;
};

async function loadNormalizer() {
  let loadedModule: ColorCountModule = {};
  const modulePath = './colorCountInput.ts';

  try {
    loadedModule = await import(modulePath);
  } catch {
    // The first TDD run intentionally happens before the implementation exists.
  }

  assert.equal(
    typeof loadedModule.normalizeColorCountInput,
    'function',
    'normalizeColorCountInput should be implemented',
  );

  return loadedModule.normalizeColorCountInput!;
}

test('accepts a color count entered as an integer', async () => {
  const normalizeColorCountInput = await loadNormalizer();

  assert.equal(normalizeColorCountInput('24', 16, 221), 24);
});

test('keeps the current color count when the input is empty or invalid', async () => {
  const normalizeColorCountInput = await loadNormalizer();

  assert.equal(normalizeColorCountInput('', 16, 221), 16);
  assert.equal(normalizeColorCountInput('not-a-number', 16, 221), 16);
});

test('rounds decimal input and clamps it to the available palette range', async () => {
  const normalizeColorCountInput = await loadNormalizer();

  assert.equal(normalizeColorCountInput('12.6', 16, 221), 13);
  assert.equal(normalizeColorCountInput('0', 16, 221), 1);
  assert.equal(normalizeColorCountInput('300', 16, 221), 221);
});
