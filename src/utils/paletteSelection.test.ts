import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { loadPaletteMode, savePaletteMode } from './localStorageUtils.ts';
import { selectGenerationPalette } from './paletteSelection.ts';

const require = createRequire(import.meta.url);
const colorSystemMapping = require('../app/colorSystemMapping.json') as Record<
  string,
  { MARD?: string }
>;

const palette = Object.entries(colorSystemMapping)
  .filter(([, mapping]) => /^[A-HM]\d+$/i.test(mapping.MARD ?? ''))
  .map(([hex]) => ({ hex: hex.toUpperCase() }));

test('standard brand mode ignores a stale custom subset and keeps exact black and bright green available', () => {
  const selected = selectGenerationPalette({
    palette,
    customSelections: {
      '#000000': false,
      '#5DE035': false,
      '#9CAB5A': true,
    },
    useCustomPalette: false,
  });

  assert.equal(selected.length, 221);
  assert.equal(new Set(selected.map((color) => color.hex)).size, 221);
  assert.ok(selected.some((color) => color.hex === '#000000'), 'H07 pure black must remain available');
  assert.ok(selected.some((color) => color.hex === '#5DE035'), 'B04 bright green must remain available');
  assert.ok(selected.some((color) => color.hex === '#9CAB5A'), 'B32 remains a valid color, not a hard-coded ban');
});

test('custom mode applies the user-selected subset', () => {
  const selected = selectGenerationPalette({
    palette,
    customSelections: {
      '#000000': true,
      '#5DE035': false,
      '#9CAB5A': false,
    },
    useCustomPalette: true,
  });

  assert.deepEqual(selected.map((color) => color.hex), ['#000000']);
});

test('explicitly excluded colors stay unavailable in standard mode', () => {
  const selected = selectGenerationPalette({
    palette,
    useCustomPalette: false,
    excludedColorKeys: new Set(['#9CAB5A']),
  });

  assert.equal(selected.length, 220);
  assert.equal(selected.some((color) => color.hex === '#9CAB5A'), false);
});

test('legacy saved selections do not silently enable custom mode', () => {
  const storage = new Map<string, string>();
  const previousLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });

  try {
    storage.set('customPerlerPaletteSelections', JSON.stringify({ '#9CAB5A': true }));
    assert.equal(loadPaletteMode(), false);

    savePaletteMode(true);
    assert.equal(loadPaletteMode(), true);

    savePaletteMode(false);
    assert.equal(loadPaletteMode(), false);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: previousLocalStorage,
    });
  }
});
