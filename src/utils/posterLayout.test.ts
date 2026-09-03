import assert from 'node:assert/strict';
import test from 'node:test';
import * as posterLayout from './posterLayout.ts';
import {
  applyPosterTextStyleToAll,
  buildPosterBaseLayers,
  constrainPosterTransform,
  getReadablePosterTextColors,
  mergePosterLayerTransforms,
  movePosterLayer,
  posterFontOptions,
  posterTextEffectPresets,
  resolvePosterTextStyle,
  stripFileExtension,
  updatePosterTextStyleOverride,
  type PosterLayerTransform,
} from './posterLayout.ts';

test('resolves the hot-blooded comic preset into editable advanced text settings', () => {
  const preset = posterTextEffectPresets.find((item) => item.id === ('comic' as never));
  assert.ok(preset, '应提供“热血漫画”艺术字预设');
  assert.equal(preset.name, '热血漫画');

  const layers = buildPosterBaseLayers([], {
    title: '龙珠孙悟天拼豆', subtitle: '', bottomTitle: '', fixedText: '', layoutMode: 'auto',
  });
  const style = resolvePosterTextStyle(
    layers[0],
    updatePosterTextStyleOverride([], layers[0], preset.patch)
  ) as unknown as Record<string, unknown>;

  assert.equal(style.fillMode, 'characters');
  assert.equal(style.fill, '#FFD62F');
  assert.equal(style.fillSecondary, '#FF861A');
  assert.equal(style.fillTertiary, '#F23A20');
  assert.equal(style.strokeColor, '#111111');
  assert.equal(style.strokeWidth, 9);
  assert.equal(style.letterSpacing, -2);
  assert.equal(style.scaleX, 1.08);
  assert.equal(style.scaleY, 0.98);
  assert.equal(style.skewX, -4);
  assert.equal(style.extrusionDepth, 6);
  assert.equal(style.extrusionColor, '#111111');
  assert.equal(style.characterRhythm, 2);
});

test('builds deterministic warm character colors and rhythm for canvas and DOM renderers', () => {
  const buildGlyphs = (posterLayout as unknown as {
    buildPosterTextGlyphs?: (text: string, style: Record<string, unknown>) => Array<Record<string, unknown>>;
  }).buildPosterTextGlyphs;
  assert.equal(typeof buildGlyphs, 'function', '应提供共享的逐字布局函数');

  const style = {
    fillMode: 'characters',
    fill: '#FFD62F',
    fillSecondary: '#FF861A',
    fillTertiary: '#F23A20',
    characterRhythm: 5,
  };
  const first = buildGlyphs!('龙珠孙悟天拼豆', style);
  const second = buildGlyphs!('龙珠孙悟天拼豆', style);

  assert.deepEqual(first, second);
  assert.equal(first.length, 7);
  assert.equal(first[0].fill, '#FFD62F');
  assert.equal(first[3].fill, '#FF861A');
  assert.equal(first[6].fill, '#F23A20');
  assert.notEqual(first[0].offsetY, first[1].offsetY);
});

test('keeps the comic color face above outline and free of black stroke', () => {
  const buildPaintLayers = (posterLayout as unknown as {
    buildPosterTextPaintLayers?: (style: Record<string, unknown>) => Array<Record<string, unknown>>;
  }).buildPosterTextPaintLayers;
  assert.equal(typeof buildPaintLayers, 'function', '应提供明确的艺术字绘制层级');

  const layers = buildPaintLayers!({
    strokeEnabled: true,
    strokeColor: '#111111',
    strokeWidth: 9,
    extrusionDepth: 6,
    extrusionColor: '#111111',
  });

  assert.deepEqual(layers.map((layer) => layer.role), ['extrusion', 'outline', 'face']);
  assert.equal(layers.at(-1)?.strokeWidth, 0, '最上方彩色字面不能继承黑色描边');
  assert.equal(layers.at(-1)?.offsetX, 0);
  assert.equal(layers.at(-1)?.offsetY, 0);
});

test('bends a title into an editable upward arch with tangent character rotation', () => {
  const buildGlyphs = (posterLayout as unknown as {
    buildPosterTextGlyphs: (text: string, style: Record<string, unknown>) => Array<Record<string, number | string | string[]>>;
  }).buildPosterTextGlyphs;
  const arched = buildGlyphs('小动物看看', {
    fillMode: 'characters',
    fill: '#FFD62F',
    fillSecondary: '#FF861A',
    fillTertiary: '#F23A20',
    characterRhythm: 0,
    curve: 60,
  });
  const middle = arched[Math.floor(arched.length / 2)];

  assert.ok(Number(arched[0].offsetY) > Number(middle.offsetY), '拱形两端应低于中间');
  assert.ok(Number(arched[0].rotation) < 0, '左侧文字应沿弧线向左旋转');
  assert.ok(Number(arched.at(-1)?.rotation) > 0, '右侧文字应沿弧线向右旋转');
});

test('uses the uploaded file name only as an input placeholder', () => {
  assert.equal(stripFileExtension('妙蛙种子.高清版.png'), '妙蛙种子.高清版');

  const layers = buildPosterBaseLayers(
    [{ id: 'item-1', imageSrc: 'data:image/png;base64,abc', label: '', sourceName: '妙蛙种子' }],
    { title: '', subtitle: '', bottomTitle: '', fixedText: '', layoutMode: 'auto' }
  );

  assert.equal(layers.filter((layer) => layer.kind === 'item-label').length, 0);
});

test('fills labels from source names by default and clears them when the preference is disabled', () => {
  const applyPreference = (posterLayout as unknown as {
    applyPosterSourceNamePreference?: <T extends { sourceName: string; label: string }>(items: T[], enabled: boolean) => T[];
  }).applyPosterSourceNamePreference;
  assert.equal(typeof applyPreference, 'function', '应提供原图片名称偏好同步函数');

  const items = [
    { id: '1', sourceName: '猫头鹰 01', label: '自定义名称' },
    { id: '2', sourceName: '小企鹅 02', label: '' },
  ];
  const enabled = applyPreference!(items, true);
  const disabled = applyPreference!(enabled, false);

  assert.deepEqual(enabled.map((item) => item.label), ['猫头鹰 01', '小企鹅 02']);
  assert.deepEqual(disabled.map((item) => item.label), ['', '']);
  assert.deepEqual(disabled.map((item) => item.sourceName), ['猫头鹰 01', '小企鹅 02']);
  assert.equal(items[0].label, '自定义名称', '切换开关不能直接修改旧状态对象');
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
    fillMode: 'characters' as const,
    fillSecondary: '#FF861A',
    fillTertiary: '#F23A20',
    scaleX: 1.14,
    scaleY: 0.95,
    skewX: -6,
    extrusionDepth: 12,
    extrusionColor: '#111111',
    characterRhythm: 5,
    curve: 70,
  };

  const overrides = applyPosterTextStyleToAll(layers, selectedStyle);

  assert.deepEqual(
    overrides.map(({ id }) => id).sort(),
    ['item-label-item-1', 'poster-fixed-text', 'poster-title']
  );
  assert.equal(overrides.every((style) => style.fill === '#18C3FF'), true);
  assert.equal(overrides.every((style) => style.scaleX === 1.14), true);
  assert.equal(overrides.every((style) => style.extrusionDepth === 12), true);
  assert.equal(overrides.every((style) => style.fillMode === 'characters'), true);
  assert.equal(overrides.every((style) => style.curve === 70), true);
  assert.equal(overrides.some((style) => style.id === 'item-image-item-1'), false);
});

test('normalizes text overrides created before advanced art-text controls existed', () => {
  const [title] = buildPosterBaseLayers([], {
    title: '旧封面', subtitle: '', bottomTitle: '', fixedText: '', layoutMode: 'auto',
  });
  const legacyOverride = {
    id: title.id,
    fill: '#FFFFFF',
    strokeEnabled: true,
    strokeColor: '#111111',
    strokeWidth: 10,
    fontFamily: 'Arial, sans-serif',
    fontWeight: 900,
    letterSpacing: 0,
    effect: 'outline',
  } as unknown as import('./posterLayout.ts').PosterTextStyleOverride;

  const style = resolvePosterTextStyle(title, [legacyOverride]);
  assert.equal(style.fillMode, 'solid');
  assert.equal(style.scaleX, 1);
  assert.equal(style.scaleY, 1);
  assert.equal(style.skewX, 0);
  assert.equal(style.extrusionDepth, 0);
  assert.equal(style.characterRhythm, 0);
  assert.equal(style.curve, 0);
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
  const selectableFonts = new Set<string>(posterFontOptions.map((font) => font.value));

  assert.equal(
    layers.filter((layer) => layer.textStyle).every((layer) => selectableFonts.has(layer.textStyle!.family)),
    true
  );
});
