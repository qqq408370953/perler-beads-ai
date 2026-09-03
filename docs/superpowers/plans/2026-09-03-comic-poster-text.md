# Comic Poster Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editable “热血漫画” text preset whose DOM preview and Canvas export reproduce chunky gradient lettering, heavy outline, hard extrusion, stretch, skew, and deterministic per-character rhythm.

**Architecture:** Extend the pure poster text-style model with normalized advanced fields and a deterministic glyph-layout helper. The free-layout DOM renderer and Canvas renderer consume the same resolved style and glyph descriptors, avoiding vector-path conversion while retaining editable text.

**Tech Stack:** Next.js 15, React 19, TypeScript, Canvas 2D, CSS transforms, Tailwind CSS, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-03-comic-poster-text-design.md`

## Global Constraints

- Text remains editable; do not convert it into a permanent raster or vector-path asset.
- Preview and exported PNG use the same persisted style values.
- Existing presets and old in-memory overrides remain compatible through defaults.
- “应用到全部文字” remains explicit; ordinary controls affect only the selected text layer.
- Do not add a third-party rendering dependency.

---

### Task 1: Advanced text-style model

**Files:**
- Modify: `src/utils/posterLayout.ts`
- Modify: `src/utils/posterLayout.test.ts`

**Interfaces:**
- Extends `PosterTextStyleOverride` with `fillMode`, `fillSecondary`, `fillTertiary`, `scaleX`, `scaleY`, `skewX`, `extrusionDepth`, `extrusionColor`, and `characterRhythm`.
- Produces `buildPosterTextGlyphs(text, style)` for deterministic character paint and transforms.

- [x] **Step 1: Write failing tests** for the “热血漫画” resolved defaults, old-style normalization, deterministic glyph colors, and apply-to-all propagation.
- [x] **Step 2: Run** `node --no-warnings --test --experimental-strip-types src/utils/posterLayout.test.ts` and confirm failures identify the absent preset/model.
- [x] **Step 3: Implement** normalized defaults, the new preset, effect resolution, and the pure glyph helper.
- [x] **Step 4: Re-run** the focused test and require all assertions to pass.

### Task 2: Shared visual rendering

**Files:**
- Modify: `src/components/PosterFreeLayoutModal.tsx`
- Modify: `src/app/poster/page.tsx`

**Interfaces:**
- Consumes `ResolvedPosterTextStyle` and `buildPosterTextGlyphs`.
- DOM preview paints per-character spans and advanced transforms.
- Canvas preview/export paints identical character colors, transforms, stroke, and extrusion.

- [x] **Step 1: Add** a reusable DOM style builder within the modal for gradient/stroke/extrusion shadows.
- [x] **Step 2: Render** character mode as deterministic spans and apply scale/skew at the inner text-group level.
- [x] **Step 3: Refactor** `drawTextFit` to consume resolved styles, fit transformed width, and draw hard extrusion before the foreground.
- [x] **Step 4: Run** focused tests and `npx tsc --noEmit`.

### Task 3: Editor controls and verification

**Files:**
- Modify: `src/components/PosterFreeLayoutModal.tsx`

**Interfaces:**
- Produces selected-layer controls for fill mode and colors, horizontal/vertical stretch, skew, extrusion depth/color, and character rhythm.

- [x] **Step 1: Add** compact mobile-friendly controls below the existing preset selector.
- [x] **Step 2: Ensure** selecting a preset or changing a control updates only the selected layer until “应用到全部文字” is clicked.
- [x] **Step 3: Run** `npm test`, `npx tsc --noEmit`, `npm run build`, and `git diff --check`.
- [x] **Step 4: Review** the final diff against every requirement in the design spec.
