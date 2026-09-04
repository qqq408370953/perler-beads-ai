import assert from 'node:assert/strict';
import test from 'node:test';

type PosterSettingsModule = {
  createDefaultPosterSettings?: () => {
    pixelate: boolean;
    addOutline: boolean;
  };
};

async function loadPosterSettingsModule() {
  let loadedModule: PosterSettingsModule = {};

  try {
    loadedModule = await import('./posterSettings.ts');
  } catch {
    // The first TDD run intentionally happens before the shared defaults exist.
  }

  return loadedModule;
}

test('new poster projects keep optional pixelation and white outline disabled', async () => {
  const settingsModule = await loadPosterSettingsModule();
  assert.equal(typeof settingsModule.createDefaultPosterSettings, 'function');

  const defaults = settingsModule.createDefaultPosterSettings?.();
  assert.equal(defaults?.pixelate, false);
  assert.equal(defaults?.addOutline, false);
});
