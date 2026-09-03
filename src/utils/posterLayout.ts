export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1440;

export type PosterLayoutMode =
  | 'auto'
  | '1x1'
  | '1x2'
  | '2x1'
  | '2x2'
  | '3x2'
  | '4x2'
  | '5x2'
  | '5x3';

export type PosterLayerKind =
  | 'title'
  | 'subtitle'
  | 'item-image'
  | 'item-label'
  | 'bottom-title'
  | 'fixed-text';

export interface PosterLayerTransform {
  id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  zIndex: number;
}

export interface PosterTextStyle {
  fontSize: number;
  minFontSize: number;
  family: string;
  weight: number;
  fill: string;
  stroke?: { color: string; width: number };
}

export type PosterTextEffect = 'none' | 'outline' | 'candy' | 'neon' | 'dimensional' | 'gold';

export interface PosterTextStyleOverride {
  id: string;
  fill: string;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  fontFamily: string;
  fontWeight: number;
  letterSpacing: number;
  effect: PosterTextEffect;
}

export interface ResolvedPosterTextStyle extends PosterTextStyleOverride {
  gradient?: [string, string, string];
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
}

export interface PosterBaseLayer {
  id: string;
  kind: PosterLayerKind;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  itemId?: string;
  imageSrc?: string;
  text?: string;
  textStyle?: PosterTextStyle;
  shadow?: boolean;
}

export interface PosterLayoutItem {
  id: string;
  imageSrc: string;
  label: string;
  sourceName: string;
}

export interface PosterLayoutSettings {
  title: string;
  subtitle: string;
  bottomTitle: string;
  fixedText: string;
  layoutMode: PosterLayoutMode;
  primaryText?: string;
  secondaryText?: string;
  outlineColor?: string;
}

export interface PosterBackgroundPreset {
  name: string;
  start: string;
  end: string;
  primary: string;
  secondary: string;
  outline: string;
}

export const posterFontOptions = [
  { name: '艺术粗体', value: 'Impact, Arial Black, sans-serif' },
  { name: '经典黑体', value: 'Arial Black, PingFang SC, Microsoft YaHei, sans-serif' },
  { name: '清晰黑体', value: 'PingFang SC, Microsoft YaHei, Arial, sans-serif' },
  { name: '简洁字体', value: 'Arial, sans-serif' },
  { name: '圆润字体', value: 'Arial Rounded MT Bold, PingFang SC, Microsoft YaHei, sans-serif' },
  { name: '典雅宋体', value: 'STSong, SimSun, Songti SC, serif' },
  { name: '手写楷体', value: 'STKaiti, KaiTi, serif' },
] as const;

export const posterTextEffectPresets: Array<{
  id: PosterTextEffect;
  name: string;
  patch: Partial<Omit<PosterTextStyleOverride, 'id'>>;
}> = [
  { id: 'none', name: '无', patch: { effect: 'none' } },
  { id: 'outline', name: '白字黑边', patch: { effect: 'outline', fill: '#FFFFFF', strokeEnabled: true, strokeColor: '#111111', strokeWidth: 10 } },
  { id: 'candy', name: '糖果渐变', patch: { effect: 'candy', fill: '#FF5E93', strokeEnabled: true, strokeColor: '#8F1D5C', strokeWidth: 7 } },
  { id: 'neon', name: '霓虹发光', patch: { effect: 'neon', fill: '#FFFFFF', strokeEnabled: true, strokeColor: '#7C3AED', strokeWidth: 5 } },
  { id: 'dimensional', name: '立体投影', patch: { effect: 'dimensional', fill: '#FFF7ED', strokeEnabled: true, strokeColor: '#3F2D20', strokeWidth: 6 } },
  { id: 'gold', name: '金色质感', patch: { effect: 'gold', fill: '#F5C04A', strokeEnabled: true, strokeColor: '#6B3A00', strokeWidth: 6 } },
];

interface PosterLayout {
  cols: number;
  rows: number;
  capacity: number;
}

const fixedLayouts: Record<Exclude<PosterLayoutMode, 'auto'>, PosterLayout> = {
  '1x1': { cols: 1, rows: 1, capacity: 1 },
  '1x2': { cols: 1, rows: 2, capacity: 2 },
  '2x1': { cols: 2, rows: 1, capacity: 2 },
  '2x2': { cols: 2, rows: 2, capacity: 4 },
  '3x2': { cols: 3, rows: 2, capacity: 6 },
  '4x2': { cols: 4, rows: 2, capacity: 8 },
  '5x2': { cols: 5, rows: 2, capacity: 10 },
  '5x3': { cols: 5, rows: 3, capacity: 15 },
};

function getPosterLayout(count: number, mode: PosterLayoutMode): PosterLayout {
  if (mode !== 'auto') return fixedLayouts[mode];
  if (count <= 1) return fixedLayouts['1x1'];
  if (count <= 2) return fixedLayouts['1x2'];
  if (count <= 4) return fixedLayouts['2x2'];
  if (count <= 6) return fixedLayouts['3x2'];
  if (count <= 8) return fixedLayouts['4x2'];
  if (count <= 10) return fixedLayouts['5x2'];
  return fixedLayouts['5x3'];
}

function getPosterItemArea(layout: PosterLayout) {
  if (layout.cols === 1 && layout.rows === 1) return { x: 120, y: 320, width: 840, height: 670 };
  if (layout.cols === 1 && layout.rows === 2) return { x: 160, y: 318, width: 760, height: 690 };
  if (layout.cols === 2 && layout.rows === 1) return { x: 90, y: 340, width: 900, height: 620 };
  if (layout.rows === 2) return { x: 86, y: 360, width: 908, height: 600 };
  return { x: 86, y: 320, width: 908, height: 650 };
}

function getImageBounds(layout: PosterLayout, cellWidth: number, cellHeight: number) {
  if (layout.cols === 1 && layout.rows === 1) {
    return { maxWidth: Math.min(560, cellWidth * 0.78), maxHeight: Math.min(440, cellHeight * 0.66), imageCenterRatio: 0.45, labelRatio: 0.84, labelFontSize: 28 };
  }
  if (layout.cols === 1 && layout.rows === 2) {
    return { maxWidth: Math.min(430, cellWidth * 0.72), maxHeight: Math.min(238, cellHeight * 0.7), imageCenterRatio: 0.44, labelRatio: 0.82, labelFontSize: 26 };
  }
  if (layout.cols === 2 && layout.rows === 1) {
    return { maxWidth: Math.min(340, cellWidth * 0.76), maxHeight: Math.min(360, cellHeight * 0.62), imageCenterRatio: 0.46, labelRatio: 0.82, labelFontSize: 26 };
  }
  if (layout.cols === 2) {
    return { maxWidth: Math.min(300, cellWidth * 0.72), maxHeight: Math.min(230, cellHeight * 0.68), imageCenterRatio: 0.42, labelRatio: 0.82, labelFontSize: 24 };
  }
  return { maxWidth: Math.min(layout.rows > 2 ? 168 : 190, cellWidth * 0.82), maxHeight: Math.min(layout.rows > 2 ? 146 : 190, cellHeight * 0.64), imageCenterRatio: 0.42, labelRatio: 0.82, labelFontSize: 23 };
}

export function stripFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
}

export function buildPosterBaseLayers(
  items: PosterLayoutItem[],
  settings: PosterLayoutSettings
): PosterBaseLayer[] {
  const layers: PosterBaseLayer[] = [];
  const primaryText = settings.primaryText ?? '#FFFFFF';
  const secondaryText = settings.secondaryText ?? 'rgba(52, 34, 23, 0.88)';
  const outlineColor = settings.outlineColor ?? '#24160F';
  let zIndex = 0;

  if (settings.title.trim()) {
    layers.push({
      id: 'poster-title', kind: 'title', x: 540, y: 150, width: 780, height: 110, zIndex: zIndex++,
      text: settings.title.trim(),
      textStyle: { fontSize: 76, minFontSize: 42, family: 'Impact, Arial Black, sans-serif', weight: 900, fill: primaryText, stroke: { color: outlineColor, width: 12 } },
    });
  }
  if (settings.subtitle.trim()) {
    layers.push({
      id: 'poster-subtitle', kind: 'subtitle', x: 540, y: 242, width: 840, height: 56, zIndex: zIndex++,
      text: settings.subtitle.trim(),
      textStyle: { fontSize: 30, minFontSize: 20, family: 'Arial, sans-serif', weight: 400, fill: secondaryText },
    });
  }

  const layout = getPosterLayout(items.length, settings.layoutMode);
  const visibleItems = items.slice(0, layout.capacity);
  const count = visibleItems.length;
  const visibleRows = layout.cols === 1 ? Math.max(1, Math.min(layout.rows, count)) : layout.rows;
  const area = getPosterItemArea(layout);
  const cellWidth = area.width / layout.cols;
  const cellHeight = area.height / visibleRows;
  const imageBounds = getImageBounds(layout, cellWidth, cellHeight);

  visibleItems.forEach((item, index) => {
    const row = Math.floor(index / layout.cols);
    const col = index % layout.cols;
    const centerX = area.x + col * cellWidth + cellWidth / 2;
    const cellTop = area.y + row * cellHeight;
    const imageCenterY = cellTop + cellHeight * imageBounds.imageCenterRatio;
    layers.push({
      id: `item-image-${item.id}`, kind: 'item-image', itemId: item.id, imageSrc: item.imageSrc,
      x: centerX, y: imageCenterY, width: imageBounds.maxWidth, height: imageBounds.maxHeight,
      zIndex: zIndex++, shadow: true,
    });
    const label = item.label.trim();
    if (label) {
      layers.push({
        id: `item-label-${item.id}`, kind: 'item-label', itemId: item.id, text: label,
        x: centerX, y: cellTop + cellHeight * imageBounds.labelRatio, width: cellWidth - 16,
        height: imageBounds.labelFontSize * 1.8, zIndex: zIndex++,
        textStyle: { fontSize: imageBounds.labelFontSize, minFontSize: 16, family: 'Arial, sans-serif', weight: 600, fill: secondaryText },
      });
    }
  });

  if (settings.bottomTitle.trim()) {
    layers.push({
      id: 'poster-bottom-title', kind: 'bottom-title', x: 540, y: 1146, width: 840, height: 120, zIndex: zIndex++,
      text: settings.bottomTitle.trim(),
      textStyle: { fontSize: 92, minFontSize: 48, family: 'Arial Black, PingFang SC, Microsoft YaHei, sans-serif', weight: 900, fill: primaryText, stroke: { color: outlineColor, width: 14 } },
    });
  }
  if (settings.fixedText.trim()) {
    layers.push({
      id: 'poster-fixed-text', kind: 'fixed-text', x: 540, y: 1266, width: 760, height: 82, zIndex: zIndex++,
      text: settings.fixedText.trim(),
      textStyle: { fontSize: 56, minFontSize: 36, family: 'Arial Black, PingFang SC, Microsoft YaHei, sans-serif', weight: 900, fill: primaryText, stroke: { color: outlineColor, width: 10 } },
    });
  }
  return layers;
}

export function mergePosterLayerTransforms(
  layers: PosterBaseLayer[],
  saved: PosterLayerTransform[] | null | undefined
): PosterLayerTransform[] {
  const savedById = new Map((saved ?? []).map((transform) => [transform.id, transform]));
  return layers.map((layer) => {
    const existing = savedById.get(layer.id);
    return existing
      ? constrainPosterTransform(existing)
      : { id: layer.id, x: layer.x, y: layer.y, scale: 1, rotation: 0, zIndex: layer.zIndex };
  });
}

function getDefaultPosterTextStyle(layer: PosterBaseLayer): PosterTextStyleOverride {
  const style = layer.textStyle;
  if (!style) {
    throw new Error(`Layer ${layer.id} is not a text layer`);
  }
  return {
    id: layer.id,
    fill: style.fill,
    strokeEnabled: Boolean(style.stroke),
    strokeColor: style.stroke?.color ?? '#111111',
    strokeWidth: style.stroke?.width ?? 6,
    fontFamily: style.family,
    fontWeight: style.weight,
    letterSpacing: 0,
    effect: 'none',
  };
}

export function resolvePosterTextStyle(
  layer: PosterBaseLayer,
  overrides: PosterTextStyleOverride[]
): ResolvedPosterTextStyle {
  const style = overrides.find((item) => item.id === layer.id) ?? getDefaultPosterTextStyle(layer);
  if (style.effect === 'candy') {
    return {
      ...style,
      gradient: ['#FFF1A8', '#FF7DB2', '#FF3D81'],
      shadow: { color: 'rgba(143, 29, 92, 0.38)', blur: 5, offsetX: 4, offsetY: 6 },
    };
  }
  if (style.effect === 'neon') {
    return {
      ...style,
      shadow: { color: style.strokeColor, blur: 24, offsetX: 0, offsetY: 0 },
    };
  }
  if (style.effect === 'dimensional') {
    return {
      ...style,
      shadow: { color: 'rgba(40, 28, 20, 0.62)', blur: 2, offsetX: 9, offsetY: 11 },
    };
  }
  if (style.effect === 'gold') {
    return {
      ...style,
      gradient: ['#FFF7BF', '#F5C04A', '#A85D00'],
      shadow: { color: 'rgba(91, 48, 0, 0.55)', blur: 8, offsetX: 7, offsetY: 9 },
    };
  }
  return { ...style };
}

export function updatePosterTextStyleOverride(
  overrides: PosterTextStyleOverride[],
  layer: PosterBaseLayer,
  patch: Partial<Omit<PosterTextStyleOverride, 'id'>>
): PosterTextStyleOverride[] {
  const current = resolvePosterTextStyle(layer, overrides);
  const next: PosterTextStyleOverride = {
    id: layer.id,
    fill: current.fill,
    strokeEnabled: current.strokeEnabled,
    strokeColor: current.strokeColor,
    strokeWidth: current.strokeWidth,
    fontFamily: current.fontFamily,
    fontWeight: current.fontWeight,
    letterSpacing: current.letterSpacing,
    effect: current.effect,
    ...patch,
  };
  const withoutCurrent = overrides.filter((item) => item.id !== layer.id);
  return [...withoutCurrent, next];
}

export function applyPosterTextStyleToAll(
  layers: PosterBaseLayer[],
  source: ResolvedPosterTextStyle
): PosterTextStyleOverride[] {
  return layers
    .filter((layer) => Boolean(layer.textStyle))
    .map((layer) => ({
      id: layer.id,
      fill: source.fill,
      strokeEnabled: source.strokeEnabled,
      strokeColor: source.strokeColor,
      strokeWidth: source.strokeWidth,
      fontFamily: source.fontFamily,
      fontWeight: source.fontWeight,
      letterSpacing: source.letterSpacing,
      effect: source.effect,
    }));
}

export function constrainPosterTransform(transform: PosterLayerTransform): PosterLayerTransform {
  const normalizedRotation = ((transform.rotation % 360) + 360) % 360;
  return {
    ...transform,
    x: Math.max(-120, Math.min(1200, transform.x)),
    y: Math.max(-120, Math.min(1560, transform.y)),
    scale: Math.max(0.2, Math.min(4, transform.scale)),
    rotation: normalizedRotation,
  };
}

export function movePosterLayer(
  transforms: PosterLayerTransform[],
  id: string,
  direction: 'forward' | 'backward' | 'front' | 'back'
): PosterLayerTransform[] {
  const ordered = [...transforms].sort((a, b) => a.zIndex - b.zIndex);
  const index = ordered.findIndex((layer) => layer.id === id);
  if (index < 0) return transforms;
  const [selected] = ordered.splice(index, 1);
  let target = index;
  if (direction === 'forward') target = Math.min(ordered.length, index + 1);
  if (direction === 'backward') target = Math.max(0, index - 1);
  if (direction === 'front') target = ordered.length;
  if (direction === 'back') target = 0;
  ordered.splice(target, 0, selected);
  return ordered.map((layer, zIndex) => ({ ...layer, zIndex }));
}

function hexLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const value = clean.length === 3 ? clean.split('').map((part) => part + part).join('') : clean;
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function getReadablePosterTextColors(start: string, end: string) {
  const average = (hexLuminance(start) + hexLuminance(end)) / 2;
  return average < 0.32
    ? { primary: '#FFFFFF', secondary: '#F8FAFC', outline: '#111827' }
    : { primary: '#FFFFFF', secondary: '#3F2D20', outline: '#4A2E1F' };
}

export const classicPosterPresets: PosterBackgroundPreset[] = [
  { name: '奶油杏橙', start: '#FFF7ED', end: '#FDE68A', ...getReadablePosterTextColors('#FFF7ED', '#FDE68A') },
  { name: '蜜桃珊瑚', start: '#FED7D7', end: '#FDBA74', ...getReadablePosterTextColors('#FED7D7', '#FDBA74') },
  { name: '樱花莓粉', start: '#FCE7F3', end: '#FDA4AF', ...getReadablePosterTextColors('#FCE7F3', '#FDA4AF') },
  { name: '薄荷青柠', start: '#D1FAE5', end: '#BEF264', ...getReadablePosterTextColors('#D1FAE5', '#BEF264') },
  { name: '海盐晴空', start: '#CFFAFE', end: '#BAE6FD', ...getReadablePosterTextColors('#CFFAFE', '#BAE6FD') },
  { name: '薰衣草雾', start: '#EDE9FE', end: '#FBCFE8', ...getReadablePosterTextColors('#EDE9FE', '#FBCFE8') },
  { name: '复古焦糖', start: '#7C2D12', end: '#D97706', ...getReadablePosterTextColors('#7C2D12', '#D97706') },
  { name: '孔雀蓝绿', start: '#0F766E', end: '#0891B2', ...getReadablePosterTextColors('#0F766E', '#0891B2') },
  { name: '午夜靛蓝', start: '#1E293B', end: '#312E81', ...getReadablePosterTextColors('#1E293B', '#312E81') },
  { name: '莓果酒红', start: '#881337', end: '#7F1D1D', ...getReadablePosterTextColors('#881337', '#7F1D1D') },
];
