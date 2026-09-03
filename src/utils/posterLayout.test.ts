import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPosterTextStyleToAll,
  buildPosterBaseLayers,
  constrainPosterTransform,
  getReadablePosterTextColors,
  mergePosterLayerTransforms,
  movePosterLayer,
  posterFontOptions,
  resolvePosterTextStyle,
  stripFileExtension,
  updatePosterTextStyleOverride,
  type PosterLayerTransform,
} from './posterLayout.ts';

test('uses the uploaded file name only as an input placeholder', () => {
  assert.equal(stripFileExtension('妙蛙种子.高清版.png'), '妙蛙种子.高清版');

  const layers = buildPosterBaseLayers(
    [{ id: 'item-1', imageSrc: 'data:image/png;base64,abc', label: '', sourceName: '妙蛙种子' }],
    { title: '', subtitle: '', bottomTitle: '', fixedText: '', layoutMode: 'auto' }
  );

  assert.equal(layers.filter((layer) => layer.kind === 'item-label').length, 0);
});

test('renders a typed item name immediately instead of the source file name', () => {
  const layers = buildPosterBaseLayers(
    [{ id: 'item-1', imageSrc: 'image', label: '001 妙蛙种子', sourceName: 'IMG_9527' }],
    { title: '', subtitle: '', bottomTitle: '', fixedText: '', layoutMode: 'auto' }
  );

  const label = layers.find((layer) => layer.kind === 'item-label');
  assert.equal(label?.text, '001 妙蛙种子');
});

test('preserves edited transforms and gives newly-added layers their automatic position', () => {
  const layers = buildPosterBaseLayers(
    [{ id: 'item-1', imageSrc: 'image', label: '', sourceName: 'source' }],
    { title: '标题', subtitle: '', bottomTitle: '', fixedText: '', layoutMode: 'auto' }
  );
  const image = layers.find((layer) => layer.kind === 'item-image');
  assert.ok(image);

  const saved: PosterLayerTransform[] = [
    { id: image.id, x: 300, y: 420, scale: 1.4, rotation: 18, zIndex: 9 },
  ];
  const merged = mergePosterLayerTransforms(layers, saved);

  assert.deepEqual(merged.find((layer) => layer.id === image.id), saved[0]);
  assert.deepEqual(merged.find((layer) => layer.id === 'poster-title'), {
    id: 'poster-title',
    x: 540,
    y: 150,
    scale: 1,
    rotation: 0,
    zIndex: 0,
  });
});

test('keeps a freely moved layer recoverable inside the poster workspace', () => {
  assert.deepEqual(
    constrainPosterTransform({ id: 'layer', x: -999, y: 9999, scale: 9, rotation: 725, zIndex: 1 }),
    { id: 'layer', x: -120, y: 1560, scale: 4, rotation: 5, zIndex: 1 }
  );
});

test('moves a selected layer to the front without losing any layer', () => {
  const layers: PosterLayerTransform[] = [
    { id: 'a', x: 0, y: 0, scale: 1, rotation: 0, zIndex: 0 },
    { id: 'b', x: 0, y: 0, scale: 1, rotation: 0, zIndex: 1 },
    { id: 'c', x: 0, y: 0, scale: 1, rotation: 0, zIndex: 2 },
  ];

  assert.deepEqual(
    movePosterLayer(layers, 'a', 'front').map(({ id, zIndex }) => ({ id, zIndex })),
    [
      { id: 'b', zIndex: 0 },
      { id: 'c', zIndex: 1 },
      { id: 'a', zIndex: 2 },
    ]
  );
});

test('chooses dark supporting copy on a light background and light copy on a dark one', () => {
  assert.deepEqual(getReadablePosterTextColors('#FFF7ED', '#FDE68A'), {
    primary: '#FFFFFF',
    secondary: '#3F2D20',
    outline: '#4A2E1F',
  });
  assert.deepEqual(getReadablePosterTextColors('#1E293B', '#312E81'), {
    primary: '#FFFFFF',
    secondary: '#F8FAFC',
    outline: '#111827',
  });
});

test('changes only the selected text layer until apply-to-all is requested', () => {
  const layers = buildPosterBaseLayers([], {
    title: '顶部标题',
    subtitle: '副标题',
    bottomTitle: '',
    fixedText: '',
    layoutMode: 'auto',
  });
  const title = layers.find((layer) => layer.id === 'poster-title');
  const subtitle = layers.find((layer) => layer.id === 'poster-subtitle');
  assert.ok(title);
  assert.ok(subtitle);

  const overrides = updatePosterTextStyleOverride([], title, {
    fill: '#FF3B30',
    letterSpacing: 8,
  });

  assert.equal(resolvePosterTextStyle(title, overrides).fill, '#FF3B30');
  assert.equal(resolvePosterTextStyle(title, overrides).letterSpacing, 8);
  assert.equal(resolvePosterTextStyle(subtitle, overrides).fill, 'rgba(52, 34, 23, 0.88)');
  assert.equal(resolvePosterTextStyle(subtitle, overrides).letterSpacing, 0);
});

test('copies the selected style to every text layer but never creates an image style', () => {
  const layers = buildPosterBaseLayers(
    [{ id: 'item-1', imageSrc: 'image', label: '名称', sourceName: '原文件' }],
    { title: '标题', subtitle: '', bottomTitle: '', fixedText: '小字', layoutMode: 'auto' }
  );
  const title = layers.find((layer) => layer.id === 'poster-title');
  assert.ok(title);
  const selectedStyle = {
    ...resolvePosterTextStyle(title, []),
    fill: '#18C3FF',
    strokeEnabled: true,
    strokeColor: '#1D1747',
    strokeWidth: 9,
    fontFamily: 'STKaiti, KaiTi, serif',
    fontWeight: 800,
    letterSpacing: 5,
    effect: 'neon' as const,
  };

  const overrides = applyPosterTextStyleToAll(layers, selectedStyle);

  assert.deepEqual(
    overrides.map(({ id }) => id).sort(),
    ['item-label-item-1', 'poster-fixed-text', 'poster-title']
  );
  assert.equal(overrides.every((style) => style.fill === '#18C3FF'), true);
  assert.equal(overrides.some((style) => style.id === 'item-image-item-1'), false);
});

test('resolves the gold art-text preset into a canvas-ready gradient and shadow', () => {
  const layers = buildPosterBaseLayers([], {
    title: '金色标题', subtitle: '', bottomTitle: '', fixedText: '', layoutMode: 'auto',
  });
  const title = layers[0];
  const overrides = updatePosterTextStyleOverride([], title, { effect: 'gold' });
  const style = resolvePosterTextStyle(title, overrides);

  assert.deepEqual(style.gradient, ['#FFF7BF', '#F5C04A', '#A85D00']);
  assert.deepEqual(style.shadow, { color: 'rgba(91, 48, 0, 0.55)', blur: 8, offsetX: 7, offsetY: 9 });
});

test('offers every automatic-layout font in the text font selector', () => {
  const layers = buildPosterBaseLayers(
    [{ id: 'item-1', imageSrc: 'image', label: '名称', sourceName: '原文件' }],
    { title: '标题', subtitle: '副标题', bottomTitle: '大标题', fixedText: '小字', layoutMode: 'auto' }
  );
  const selectableFonts = new Set(posterFontOptions.map((font) => font.value));

  assert.equal(
    layers.filter((layer) => layer.textStyle).every((layer) => selectableFonts.has(layer.textStyle!.family)),
    true
  );
});
