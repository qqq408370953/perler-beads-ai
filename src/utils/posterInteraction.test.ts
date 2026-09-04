import assert from 'node:assert/strict';
import test from 'node:test';

type PointerSample = {
  x: number;
  y: number;
  scrollTop: number;
};

type PosterInteractionModule = {
  canStartPosterLayerGesture?: (selectedId: string | null, layerId: string) => boolean;
  shouldSuppressPosterPanelActivation?: (start: PointerSample, current: PointerSample) => boolean;
};

async function loadPosterInteractionModule() {
  let loadedModule: PosterInteractionModule = {};

  try {
    loadedModule = await import('./posterInteraction.ts');
  } catch {
    // The first TDD run intentionally happens before the interaction helpers exist.
  }

  return loadedModule;
}

test('locks every other poster layer while one layer is selected', async () => {
  const interaction = await loadPosterInteractionModule();
  assert.equal(typeof interaction.canStartPosterLayerGesture, 'function');

  assert.equal(interaction.canStartPosterLayerGesture?.(null, 'image-a'), true);
  assert.equal(interaction.canStartPosterLayerGesture?.('image-a', 'image-a'), true);
  assert.equal(interaction.canStartPosterLayerGesture?.('image-a', 'image-b'), false);
});

test('treats a deliberate tap as an activation but suppresses a scrolling gesture', async () => {
  const interaction = await loadPosterInteractionModule();
  assert.equal(typeof interaction.shouldSuppressPosterPanelActivation, 'function');

  assert.equal(
    interaction.shouldSuppressPosterPanelActivation?.(
      { x: 100, y: 200, scrollTop: 40 },
      { x: 103, y: 204, scrollTop: 40 },
    ),
    false,
  );
  assert.equal(
    interaction.shouldSuppressPosterPanelActivation?.(
      { x: 100, y: 200, scrollTop: 40 },
      { x: 102, y: 214, scrollTop: 52 },
    ),
    true,
  );
});
