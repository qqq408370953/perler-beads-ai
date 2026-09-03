import assert from 'node:assert/strict';
import test from 'node:test';

type PreviewCell = {
  key: string;
  color: string;
  isExternal?: boolean;
};

type SocialPreviewModule = {
  calculateSocialPreviewCellSize?: (dimensions: { N: number; M: number }) => number;
  isSocialPreviewBackgroundCell?: (cell?: PreviewCell | null) => boolean;
  calculateSocialPreviewStatsLayout?: (colorCount: number, availableWidth: number) => {
    columns: number;
    rows: number;
    rowHeight: number;
    height: number;
  };
  getSocialPreviewCrossSegments?: (cellSize: number) => Array<[number, number, number, number]>;
  getSocialPreviewGridLineStyles?: () => {
    minor: { color: string; width: number };
    major: { color: string; width: number };
  };
};

async function loadSocialPreviewModule() {
  let loadedModule: SocialPreviewModule = {};
  const modulePath = './socialPreviewImage.ts';

  try {
    loadedModule = await import(modulePath);
  } catch {
    // The first TDD run intentionally happens before the implementation exists.
  }

  return loadedModule;
}

test('social preview uses integer cells sized for its longest grid edge', async () => {
  const preview = await loadSocialPreviewModule();
  assert.equal(typeof preview.calculateSocialPreviewCellSize, 'function');

  assert.equal(preview.calculateSocialPreviewCellSize?.({ N: 104, M: 100 }), 9);
  assert.equal(preview.calculateSocialPreviewCellSize?.({ N: 156, M: 149 }), 6);
  assert.equal(preview.calculateSocialPreviewCellSize?.({ N: 52, M: 180 }), 5);
});

test('social preview marks only transparent or external cells as background', async () => {
  const preview = await loadSocialPreviewModule();
  assert.equal(typeof preview.isSocialPreviewBackgroundCell, 'function');

  assert.equal(preview.isSocialPreviewBackgroundCell?.({ key: 'H2', color: '#FFFFFF' }), false);
  assert.equal(preview.isSocialPreviewBackgroundCell?.({ key: 'ERASE', color: 'transparent' }), true);
  assert.equal(preview.isSocialPreviewBackgroundCell?.({ key: 'H2', color: '#FFFFFF', isExternal: true }), true);
  assert.equal(preview.isSocialPreviewBackgroundCell?.(null), true);
});

test('social preview keeps a 24-color legend to two compact rows at normal preview width', async () => {
  const preview = await loadSocialPreviewModule();
  assert.equal(typeof preview.calculateSocialPreviewStatsLayout, 'function');

  assert.deepEqual(preview.calculateSocialPreviewStatsLayout?.(24, 960), {
    columns: 12,
    rows: 2,
    rowHeight: 48,
    height: 152,
  });
});

test('social preview draws a short centered cross instead of filling the background cell', async () => {
  const preview = await loadSocialPreviewModule();
  assert.equal(typeof preview.getSocialPreviewCrossSegments, 'function');

  assert.deepEqual(preview.getSocialPreviewCrossSegments?.(9), [
    [2.5, 2.5, 6.5, 6.5],
    [6.5, 2.5, 2.5, 6.5],
  ]);
});

test('social preview keeps major guides subtle instead of creating dark large squares', async () => {
  const preview = await loadSocialPreviewModule();
  assert.equal(typeof preview.getSocialPreviewGridLineStyles, 'function');

  assert.deepEqual(preview.getSocialPreviewGridLineStyles?.(), {
    minor: { color: 'rgba(82, 78, 71, 0.34)', width: 1 },
    major: { color: 'rgba(69, 65, 59, 0.34)', width: 1 },
  });
});
