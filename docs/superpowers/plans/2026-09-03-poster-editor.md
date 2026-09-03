# Poster Editor Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/poster` with reusable manual watermark removal, filename-only placeholders, a locked-by-default full-screen free-layout editor, and accessible classic background palettes.

**Architecture:** Extract poster layout calculations into pure functions that produce 1080×1440 design-space layers. The page, full-screen DOM editor, preview Canvas, and export Canvas share layer IDs and transforms so automatic and custom layouts remain consistent without adding a canvas library.

**Tech Stack:** Next.js 15, React 19, TypeScript, Canvas 2D, Tailwind CSS, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-03-poster-editor-design.md`

## Global Constraints

- Default automatic layout and current poster dimensions remain 1080×1440.
- Free layout is locked by default and no third-party canvas library is added.
- A source filename is only an input placeholder; it is never rendered unless the user types a label.
- Preview and exported PNG use the same layer transforms.
- Existing tool-page watermark-removal copy and behavior remain unchanged by default.
- Mobile supports pointer drag plus two-pointer scale and rotation without accidental page scrolling.
- Production deployment and GitHub push are outside this implementation.

---

### Task 1: Pure poster layout model and tests

**Files:**
- Create: `src/utils/posterLayout.ts`
- Create: `src/utils/posterLayout.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `PosterLayerKind`, `PosterLayerTransform`, `PosterBaseLayer`, `PosterBackgroundPreset`.
- Produces: `stripFileExtension(name: string): string`.
- Produces: `mergePosterLayerTransforms(baseLayers, transforms): PosterLayerTransform[]`.
- Produces: `constrainPosterTransform(transform, bounds?): PosterLayerTransform`.
- Produces: `movePosterLayer(transforms, id, direction): PosterLayerTransform[]`.
- Produces: `getReadablePosterTextColors(start, end): { primary: string; secondary: string }`.

- [ ] **Step 1: Write failing tests for filename placeholders and transform normalization**

```ts
test('stripFileExtension removes only the final image extension', () => {
  assert.equal(stripFileExtension('皮卡丘.高清.png'), '皮卡丘.高清');
});

test('constrainPosterTransform keeps a layer recoverable', () => {
  const next = constrainPosterTransform({ id: 'title', kind: 'title', x: -5000, y: 9000, scale: 20, rotation: 540, zIndex: 2 });
  assert.equal(next.scale, 4);
  assert.equal(next.rotation, 180);
  assert.ok(next.x >= -120 && next.x <= 1200);
  assert.ok(next.y >= -120 && next.y <= 1560);
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the module does not exist**

Run: `node --no-warnings --test --experimental-strip-types src/utils/posterLayout.test.ts`

Expected: FAIL resolving `posterLayout.ts`.

- [ ] **Step 3: Implement the layout types and pure helpers**

```ts
export type PosterLayerKind = 'image' | 'item-label' | 'title' | 'subtitle' | 'bottom-title' | 'fixed-text';

export interface PosterLayerTransform {
  id: string;
  kind: PosterLayerKind;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  zIndex: number;
}

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1440;
export const POSTER_MIN_SCALE = 0.2;
export const POSTER_MAX_SCALE = 4;
```

Implement stable z-index sorting, normalized rotation in `[-180, 180]`, safe-area coordinate clamping, relative luminance, and text contrast selection.

- [ ] **Step 4: Add classic named presets and test required names, valid HEX values, and readable foregrounds**

```ts
assert.ok(CLASSIC_POSTER_PRESETS.some((preset) => preset.name === '藏蓝金'));
assert.ok(CLASSIC_POSTER_PRESETS.some((preset) => preset.name === '薄荷奶油'));
assert.match(CLASSIC_POSTER_PRESETS[0].primaryText, /^#[0-9A-F]{6}$/i);
```

- [ ] **Step 5: Add the test to `npm test` and run the complete suite**

Run: `npm test`

Expected: all existing tests and `posterLayout.test.ts` PASS.

### Task 2: Base-layer construction and Canvas rendering

**Files:**
- Modify: `src/utils/posterLayout.ts`
- Modify: `src/utils/posterLayout.test.ts`
- Modify: `src/app/poster/page.tsx`

**Interfaces:**
- Consumes: layout types and transform helpers from Task 1.
- Produces: `buildPosterBaseLayers(items, settings): PosterBaseLayer[]`.
- Produces: `resolvePosterLayers(baseLayers, transforms): PosterResolvedLayer[]`.
- Produces: `renderPosterCanvas(canvas, items, settings, transforms?)` using resolved layers.

- [ ] **Step 1: Write failing tests for automatic layer IDs and empty labels**

```ts
const layers = buildPosterBaseLayers(
  [{ id: 'p1', label: '', sourceName: '皮卡丘' }],
  { title: '标题', subtitle: '', bottomTitle: '', fixedText: '图纸在粉丝群', layoutMode: 'auto' }
);
assert.deepEqual(layers.map((layer) => layer.id), ['title', 'image:p1', 'fixed-text']);
assert.ok(!layers.some((layer) => layer.id === 'item-label:p1'));
```

- [ ] **Step 2: Run the focused test and confirm the new assertions fail**

Run: `node --no-warnings --test --experimental-strip-types src/utils/posterLayout.test.ts`

Expected: FAIL because base-layer construction is absent.

- [ ] **Step 3: Implement automatic base-layer construction matching existing coordinates**

Preserve the current `getPosterLayout`, item areas, image bounds, title coordinates, font sizes, and label coordinates. Emit labels only for non-empty `label.trim()`; never fall back to `sourceName`.

- [ ] **Step 4: Refactor Canvas drawing to resolve and transform every layer**

```ts
ctx.save();
ctx.translate(layer.transform.x, layer.transform.y);
ctx.rotate((layer.transform.rotation * Math.PI) / 180);
ctx.scale(layer.transform.scale, layer.transform.scale);
drawLayerAtOrigin(ctx, layer);
ctx.restore();
```

Sort by `zIndex`, preserve `imageSmoothingEnabled = false` for images, and draw text at final design resolution.

- [ ] **Step 5: Run tests and TypeScript**

Run: `npm test`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

### Task 3: Filename placeholder and reusable watermark-removal copy

**Files:**
- Modify: `src/components/WatermarkRemovalModal.tsx`
- Modify: `src/app/poster/page.tsx`
- Modify: `src/utils/posterLayout.test.ts`

**Interfaces:**
- Consumes: `stripFileExtension` from Task 1.
- Extends: `WatermarkRemovalModalProps` with optional `title`, `description`, `continueLabel`, and `completedContinueLabel`.
- Produces: poster watermark editor state `{ itemId: string; imageSrc: string } | null`.

- [ ] **Step 1: Add a focused filename test**

```ts
assert.equal(stripFileExtension('杰尼龟.jpeg'), '杰尼龟');
assert.equal(stripFileExtension('.hidden'), '.hidden');
```

- [ ] **Step 2: Store `sourceName` during upload while keeping `label: ''`**

```ts
return {
  id: createId(),
  sourceName: stripFileExtension(file.name),
  label: '',
  originalSrc: dataUrl,
  processedSrc: dataUrl,
  // existing processing fields
};
```

Bind `placeholder={item.sourceName}`. Canvas rendering continues using only `item.label`.

- [ ] **Step 3: Add optional modal copy with existing defaults**

```ts
interface WatermarkRemovalModalProps {
  title?: string;
  description?: string;
  continueLabel?: string;
  completedContinueLabel?: string;
  // existing props
}
```

The tool page passes nothing and therefore retains current copy.

- [ ] **Step 4: Wire the per-item button and completion behavior**

On completion, replace `originalSrc` and `processedSrc`, set `status: 'idle'`, `progress: 0`, `progressText: '去水印完成，待处理'`, `backgroundMethod: 'none'`, and close the modal. Cancel leaves state unchanged.

- [ ] **Step 5: Run tests and TypeScript**

Run: `npm test && npx tsc --noEmit`

Expected: PASS.

### Task 4: Full-screen free-layout modal

**Files:**
- Create: `src/components/PosterFreeLayoutModal.tsx`
- Modify: `src/utils/posterLayout.ts`
- Modify: `src/utils/posterLayout.test.ts`

**Interfaces:**
- Consumes: resolved base layers and transform helpers.
- Produces props: `isOpen`, `baseLayers`, `initialTransforms`, `background`, `onCancel`, `onApply`, `onReset`.
- Produces `onApply(transforms: PosterLayerTransform[]): void`.

- [ ] **Step 1: Write failing tests for layer ordering and transform preservation**

```ts
const merged = mergePosterLayerTransforms(baseLayers, [
  { id: 'image:p1', kind: 'image', x: 500, y: 600, scale: 1.3, rotation: 25, zIndex: 7 },
]);
assert.equal(merged.find((layer) => layer.id === 'image:p1')?.x, 500);
assert.equal(merged.some((layer) => layer.id === 'removed-layer'), false);
```

- [ ] **Step 2: Implement the modal shell and draft-state semantics**

Copy `initialTransforms` to draft state on open. `取消修改` calls `onCancel` without emitting draft data. `应用布局` emits constrained transforms. `恢复自动布局` uses `window.confirm` before `onReset`.

- [ ] **Step 3: Implement selection, single-pointer drag, scale handle, and rotation handle**

Convert viewport deltas by `designScale = displayedPosterWidth / 1080`. Capture pointers on active handles. Apply `touch-action: none` only to the editable poster surface and active layers.

- [ ] **Step 4: Implement two-pointer scale and rotation**

Track two active pointers for the selected layer. At gesture start, store pointer distance, angle, and the starting transform; update scale by distance ratio and rotation by angle delta through `constrainPosterTransform`.

- [ ] **Step 5: Add layer-order controls and keyboard movement**

Use `movePosterLayer` for top/bottom/forward/backward. Arrow keys move one design pixel; Shift + arrow moves ten. Escape asks for confirmation only if draft transforms differ from their opening snapshot.

- [ ] **Step 6: Run tests and TypeScript**

Run: `npm test && npx tsc --noEmit`

Expected: PASS.

### Task 5: Page integration and accessible palettes

**Files:**
- Modify: `src/app/poster/page.tsx`
- Modify: `src/utils/posterLayout.ts`
- Modify: `src/utils/posterLayout.test.ts`

**Interfaces:**
- Consumes: `PosterFreeLayoutModal`, classic presets, base-layer builder, and transforms.
- Extends `PosterSettings` with `primaryText`, `secondaryText`.
- Stores `customTransforms: PosterLayerTransform[] | null` and `isFreeLayoutOpen: boolean`.

- [ ] **Step 1: Add text-color preset assertions**

Verify the 12 new preset names are unique, start/end pairs are unique, and every foreground/background combination satisfies the chosen contrast threshold for normal display copy.

- [ ] **Step 2: Replace anonymous swatches with named preset objects**

Show names in `title` and `aria-label`; retain compact swatches. Selecting a preset applies start, end, primary text, and secondary text colors together.

- [ ] **Step 3: Auto-select readable text for custom color input**

When either native color input changes, call `getReadablePosterTextColors(nextStart, nextEnd)` and update both text colors in the same settings transaction.

- [ ] **Step 4: Integrate the locked-by-default free-layout switch and modal**

The switch opens the modal. Applied transforms remain active while editing is closed. Provide a visible `已应用自由布局` state and a separate `恢复自动布局` action; adding/removing content merges current transforms with current base layers.

- [ ] **Step 5: Verify preview and export call the same renderer inputs**

Both paths call `renderPosterCanvas(canvas, items, settings, customTransforms)`. Resetting restores `customTransforms` to `null`.

- [ ] **Step 6: Run all static verification**

Run: `npm test`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `git diff --check`

Expected: exit 0.

### Task 6: Production build and regression review

**Files:**
- Review: all files changed by Tasks 1–5.

**Interfaces:**
- Consumes the completed poster editor implementation.
- Produces a buildable static export without deployment.

- [ ] **Step 1: Build the production bundle**

Run: `npm run build`

Expected: Next.js static export completes and `/poster` is generated.

- [ ] **Step 2: Review default behavior and mobile interaction risks in code**

Confirm default transforms are null, the editor opens only through the switch, pointer handlers release capture, touch action is scoped to the editor, watermark changes are item-local, and filename placeholders never enter render data.

- [ ] **Step 3: Review the final diff**

Run: `git diff --stat && git diff --check && git status --short`

Expected: only intended source, test, package script, spec, and plan files are modified; existing `ivysaur-source.png` and `pnpm-lock.yaml` remain untracked and excluded.
