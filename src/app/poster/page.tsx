'use client';

/* eslint-disable @next/next/no-img-element */

import React, {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import PosterFreeLayoutModal from '../../components/PosterFreeLayoutModal';
import WatermarkRemovalModal from '../../components/WatermarkRemovalModal';
import {
  BackgroundRemovalMode,
  BackgroundRemovalMethod,
  loadImage,
  processPosterImage,
  readFileAsDataUrl,
} from '../../utils/posterProcessing';
import {
  POSTER_HEIGHT,
  POSTER_WIDTH,
  buildPosterBaseLayers,
  classicPosterPresets,
  getReadablePosterTextColors,
  mergePosterLayerTransforms,
  resolvePosterTextStyle,
  stripFileExtension,
  type PosterLayerTransform,
  type PosterLayoutMode,
  type PosterTextStyleOverride,
} from '../../utils/posterLayout';

type ItemStatus = 'idle' | 'processing' | 'done' | 'error';

interface PosterItem {
  id: string;
  originalSrc: string;
  processedSrc: string;
  label: string;
  sourceName: string;
  status: ItemStatus;
  progressText: string;
  progress: number;
  backgroundMethod: BackgroundRemovalMethod;
  error?: string;
}

interface PosterSettings {
  title: string;
  subtitle: string;
  bottomTitle: string;
  fixedText: string;
  backgroundStart: string;
  backgroundEnd: string;
  useGradientBackground: boolean;
  layoutMode: PosterLayoutMode;
  backgroundRemovalMode: BackgroundRemovalMode;
  pixelate: boolean;
  addOutline: boolean;
  primaryText: string;
  secondaryText: string;
  outlineColor: string;
}

const defaultSettings: PosterSettings = {
  title: '',
  subtitle: '',
  bottomTitle: '',
  fixedText: '图纸在粉丝群',
  backgroundStart: '#58C7C2',
  backgroundEnd: '#F4F7F5',
  useGradientBackground: true,
  layoutMode: 'auto',
  backgroundRemovalMode: 'local',
  pixelate: true,
  addOutline: true,
  primaryText: '#FFFFFF',
  secondaryText: '#342217',
  outlineColor: '#24160F',
};

const legacyBackgroundColors = [
  ['#F7F0DF', '#FFFDF6'],
  ['#EFE4CF', '#FAF3E7'],
  ['#E8DCC7', '#F7F2EA'],
  ['#C7A27A', '#EFE0C8'],
  ['#B9895F', '#E6C7A2'],
  ['#A97852', '#DDBA92'],
  ['#F6B35D', '#FFE9A8'],
  ['#F2A45F', '#F9D394'],
  ['#EA8748', '#F4BA77'],
  ['#D96F3D', '#F1AA6A'],
  ['#DDEED8', '#F6FBF1'],
  ['#CFE6CF', '#F2F8EA'],
  ['#B9D9B6', '#EDF6E3'],
  ['#A7CC9C', '#E4F1DA'],
  ['#58C7C2', '#F4F7F5'],
  ['#F06A6A', '#F4F7F5'],
  ['#6FBF73', '#E9F2F1'],
  ['#6C8AE4', '#F3F5FA'],
  ['#E76F9A', '#EEF6F5'],
  ['#7E8C8D', '#F6F6F2'],
  ['#4DB6AC', '#E7EDF0'],
  ['#D85D4A', '#F1EDE8'],
  ['#2F9E8F', '#F5F5F5'],
  ['#F2F2F2', '#D8E3EA'],
];

const backgroundPresets = [
  ...legacyBackgroundColors.map(([start, end], index) => ({
    name: `柔和配色 ${String(index + 1).padStart(2, '0')}`,
    start,
    end,
    ...getReadablePosterTextColors(start, end),
  })),
  ...classicPosterPresets,
];

function drawTextFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  startSize: number,
  minSize: number,
  family: string,
  fill: string,
  stroke?: { color: string; width: number },
  weight = 900,
  letterSpacing = 0,
  gradientColors?: [string, string, string],
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number }
) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${letterSpacing}px`;
    if (ctx.measureText(text).width <= maxWidth || size <= minSize) break;
    size -= 2;
  } while (size > minSize);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }
  if (stroke) {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.strokeText(text, x, y);
  }
  if (gradientColors) {
    const gradient = ctx.createLinearGradient(x - maxWidth / 2, y, x + maxWidth / 2, y);
    gradient.addColorStop(0, gradientColors[0]);
    gradient.addColorStop(0.5, gradientColors[1]);
    gradient.addColorStop(1, gradientColors[2]);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = fill;
  }
  ctx.fillText(text, x, y);
}

function drawContainImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  centerX: number,
  centerY: number,
  maxWidth: number,
  maxHeight: number,
  shadow: boolean
) {
  const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
  const width = img.width * scale;
  const height = img.height * scale;
  const x = centerX - width / 2;
  const y = centerY - height / 2;

  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(35, 25, 20, 0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 10;
    ctx.shadowOffsetY = 14;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x, y, width, height);
  ctx.restore();
}

async function renderPosterCanvas(
  canvas: HTMLCanvasElement,
  items: PosterItem[],
  settings: PosterSettings,
  customTransforms: PosterLayerTransform[] | null,
  textStyleOverrides: PosterTextStyleOverride[]
) {
  const width = POSTER_WIDTH;
  const height = POSTER_HEIGHT;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);
  if (settings.useGradientBackground) {
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, settings.backgroundStart);
    gradient.addColorStop(1, settings.backgroundEnd);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = settings.backgroundStart;
  }
  ctx.fillRect(0, 0, width, height);

  const baseLayers = buildPosterBaseLayers(
    items.map((item) => ({
      id: item.id,
      imageSrc: item.processedSrc || item.originalSrc,
      label: item.label,
      sourceName: item.sourceName,
    })),
    settings
  );
  const transformById = new Map(
    mergePosterLayerTransforms(baseLayers, customTransforms).map((transform) => [transform.id, transform])
  );
  const resolvedLayers = baseLayers
    .map((layer) => ({ layer, transform: transformById.get(layer.id) }))
    .filter((entry) => entry.transform)
    .sort((a, b) => a.transform!.zIndex - b.transform!.zIndex);
  const loadedImages = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    resolvedLayers.map(async ({ layer }) => {
      if (!layer.imageSrc) return;
      try {
        loadedImages.set(layer.id, await loadImage(layer.imageSrc));
      } catch {
        loadedImages.set(layer.id, null);
      }
    })
  );

  resolvedLayers.forEach(({ layer, transform }) => {
    if (!transform) return;
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.rotate((transform.rotation * Math.PI) / 180);
    ctx.scale(transform.scale, transform.scale);
    if (layer.imageSrc) {
      const image = loadedImages.get(layer.id);
      if (image) {
        drawContainImage(ctx, image, 0, 0, layer.width, layer.height, Boolean(layer.shadow));
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.42)';
        ctx.fillRect(-58, -58, 116, 116);
      }
    } else if (layer.text && layer.textStyle) {
      const textStyle = resolvePosterTextStyle(layer, textStyleOverrides);
      drawTextFit(
        ctx,
        layer.text,
        0,
        0,
        layer.width,
        layer.textStyle.fontSize,
        layer.textStyle.minFontSize,
        textStyle.fontFamily,
        textStyle.fill,
        textStyle.strokeEnabled
          ? { color: textStyle.strokeColor, width: textStyle.strokeWidth }
          : undefined,
        textStyle.fontWeight,
        textStyle.letterSpacing,
        textStyle.gradient,
        textStyle.shadow
      );
    }
    ctx.restore();
  });

  if (items.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '700 34px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('上传图片后自动生成排版预览', width / 2, 650);
  }
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function PosterPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<PosterItem[]>([]);
  const [settings, setSettings] = useState<PosterSettings>(defaultSettings);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [watermarkItemId, setWatermarkItemId] = useState<string | null>(null);
  const [isFreeLayoutOpen, setIsFreeLayoutOpen] = useState(false);
  const [customTransforms, setCustomTransforms] = useState<PosterLayerTransform[] | null>(null);
  const [textStyleOverrides, setTextStyleOverrides] = useState<PosterTextStyleOverride[]>([]);

  const processedCount = useMemo(
    () => items.filter((item) => item.status === 'done').length,
    [items]
  );
  const posterLayers = useMemo(
    () =>
      buildPosterBaseLayers(
        items.map((item) => ({
          id: item.id,
          imageSrc: item.processedSrc || item.originalSrc,
          label: item.label,
          sourceName: item.sourceName,
        })),
        settings
      ),
    [items, settings]
  );
  const watermarkItem = items.find((item) => item.id === watermarkItemId) ?? null;

  const updateSettings = <K extends keyof PosterSettings>(key: K, value: PosterSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateBackgroundColor = (key: 'backgroundStart' | 'backgroundEnd', value: string) => {
    setSettings((prev) => {
      const backgroundStart = key === 'backgroundStart' ? value : prev.backgroundStart;
      const backgroundEnd = key === 'backgroundEnd' ? value : prev.backgroundEnd;
      const textColors = getReadablePosterTextColors(backgroundStart, backgroundEnd);
      return {
        ...prev,
        [key]: value,
        primaryText: textColors.primary,
        secondaryText: textColors.secondary,
        outlineColor: textColors.outline,
      };
    });
  };

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderPosterCanvas(canvas, items, settings, customTransforms, textStyleOverrides).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [items, settings, customTransforms, textStyleOverrides]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) return;

    const nextItems = await Promise.all(
      imageFiles.map(async (file): Promise<PosterItem> => {
        const dataUrl = await readFileAsDataUrl(file);
        return {
          id: createId(),
          originalSrc: dataUrl,
          processedSrc: dataUrl,
          label: '',
          sourceName: stripFileExtension(file.name),
          status: 'idle',
          progressText: '待处理',
          progress: 0,
          backgroundMethod: 'none',
        };
      })
    );

    setItems((prev) => [...prev, ...nextItems]);
  }, []);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      addFiles(event.target.files);
    }
    event.target.value = '';
  };

  const processItem = useCallback(
    async (itemId: string) => {
      const target = items.find((item) => item.id === itemId);
      if (!target) return;

      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, status: 'processing', progressText: '开始处理', progress: 3, error: undefined }
            : item
        )
      );

      try {
        const result = await processPosterImage(target.originalSrc, {
          backgroundRemovalMode: settings.backgroundRemovalMode,
          pixelate: settings.pixelate,
          addOutline: settings.addOutline,
          onProgress: (message, progress) => {
            setItems((prev) =>
              prev.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      progressText: message,
                      progress: typeof progress === 'number' ? progress : item.progress,
                    }
                  : item
              )
            );
          },
        });

        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  processedSrc: result.dataUrl,
                  status: 'done',
                  progressText:
                    result.backgroundMethod === 'model'
                      ? '模型抠图完成'
                      : result.backgroundMethod === 'local'
                        ? '本地算法完成'
                        : '处理完成',
                  progress: 100,
                  backgroundMethod: result.backgroundMethod,
                }
              : item
          )
        );
      } catch (error) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  status: 'error',
                  error: error instanceof Error ? error.message : '处理失败',
                  progressText: '处理失败',
                }
              : item
          )
        );
      }
    },
    [items, settings]
  );

  const processAll = async () => {
    if (!items.length || isBatchProcessing) return;
    setIsBatchProcessing(true);
    try {
      for (const item of items) {
        await processItem(item.id);
      }
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const updateItemLabel = (id: string, label: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, label } : item)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const applyWatermarkRemoval = (itemId: string, cleanedImageSrc: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              originalSrc: cleanedImageSrc,
              processedSrc: cleanedImageSrc,
              status: 'idle',
              progressText: '去水印完成，待处理',
              progress: 0,
              backgroundMethod: 'none',
              error: undefined,
            }
          : item
      )
    );
    setWatermarkItemId(null);
  };

  const moveItem = (id: string, direction: -1 | 1) => {
    setItems((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files) {
      addFiles(event.dataTransfer.files);
    }
  };

  const downloadPoster = async () => {
    const canvas = document.createElement('canvas');
    await renderPosterCanvas(canvas, items, settings, customTransforms, textStyleOverrides);
    const link = document.createElement('a');
    link.download = `poster-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main className="min-h-screen bg-slate-100 pb-28 text-slate-950 lg:pb-0">
      <div className="mx-auto grid max-w-[1480px] grid-cols-1 gap-4 px-3 py-3 sm:px-4 sm:py-5 lg:grid-cols-[390px_minmax(0,1fr)] lg:gap-5">
        <aside className="space-y-4">
          <div className="sticky top-0 z-20 -mx-3 flex items-center justify-between border-b border-slate-200 bg-slate-100/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 lg:static lg:mx-0 lg:border-b-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-0">
            <div>
              <h1 className="text-xl font-black tracking-normal">海报排版</h1>
              <p className="text-sm text-slate-500">批量图片拼图海报生成器</p>
            </div>
            <Link
              href="/"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
            >
              返回首页
            </Link>
          </div>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div
              onDrop={handleDrop}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              className={`flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed p-4 text-center sm:min-h-32 ${
                dragging ? 'border-orange-500 bg-orange-50' : 'border-slate-300 bg-slate-50'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-sm font-bold">上传 N 张图片</div>
              <div className="mt-1 text-xs text-slate-500">支持拖拽或点击选择，自动生成统一布局</div>
              <button
                type="button"
                className="mt-3 min-h-11 rounded-md bg-slate-950 px-5 py-2.5 text-sm font-bold text-white"
              >
                选择图片
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={processAll}
                disabled={!items.length || isBatchProcessing}
                className="min-h-11 rounded-md bg-orange-500 px-3 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isBatchProcessing ? '处理中...' : '批量处理'}
              </button>
              <button
                onClick={downloadPoster}
                disabled={!items.length}
                className="min-h-11 rounded-md bg-slate-950 px-3 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                导出海报
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>已上传 {items.length} 张，已处理 {processedCount} 张</span>
              <div className="flex gap-2 lg:hidden">
                <a href="#poster-preview" className="font-bold text-slate-700">
                  看预览
                </a>
                <a href="#poster-items" className="font-bold text-slate-700">
                  编辑图片
                </a>
              </div>
            </div>
          </section>

          <section id="poster-copy" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black">文案</h2>
            <label className="mt-3 block text-xs font-bold text-slate-500">英文/顶部标题</label>
            <input
              value={settings.title}
              placeholder="JACKIE CHAN"
              onChange={(event) => updateSettings('title', event.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-base md:text-sm"
            />
            <label className="mt-3 block text-xs font-bold text-slate-500">副标题</label>
            <input
              value={settings.subtitle}
              placeholder="成龙历险记 · 八位经典角色"
              onChange={(event) => updateSettings('subtitle', event.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-base md:text-sm"
            />
            <label className="mt-3 block text-xs font-bold text-slate-500">底部大标题</label>
            <input
              value={settings.bottomTitle}
              placeholder="经典人物八位"
              onChange={(event) => updateSettings('bottomTitle', event.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-base md:text-sm"
            />
            <label className="mt-3 block text-xs font-bold text-slate-500">底部小字</label>
            <input
              value={settings.fixedText}
              onChange={(event) => updateSettings('fixedText', event.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-base font-bold text-slate-700 md:text-sm"
            />
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black">样式</h2>
            <label className="mt-3 flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold">
              <span>
                渐变背景
                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                  关闭后只使用左侧颜色作为纯色背景
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.useGradientBackground}
                onChange={(event) => updateSettings('useGradientBackground', event.target.checked)}
                className="h-6 w-6 shrink-0"
              />
            </label>
            <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6">
              {backgroundPresets.map((preset) => (
                <button
                  key={`${preset.name}-${preset.start}-${preset.end}`}
                  type="button"
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      backgroundStart: preset.start,
                      backgroundEnd: preset.end,
                      primaryText: preset.primary,
                      secondaryText: preset.secondary,
                      outlineColor: preset.outline,
                    }))
                  }
                  className="group relative h-10 rounded-md border border-slate-300 sm:h-8"
                  style={{ background: `linear-gradient(90deg, ${preset.start}, ${preset.end})` }}
                  aria-label={`选择${preset.name}背景色`}
                  title={preset.name}
                />
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              后 10 组为经典搭配：奶油杏橙、蜜桃珊瑚、樱花莓粉、薄荷青柠、海盐晴空、薰衣草雾、复古焦糖、孔雀蓝绿、午夜靛蓝、莓果酒红。
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">
                  {settings.useGradientBackground ? '起始颜色' : '纯色背景'}
                </span>
                <input
                  type="color"
                  value={settings.backgroundStart}
                  onChange={(event) => updateBackgroundColor('backgroundStart', event.target.value)}
                  className="h-11 w-full rounded-md border border-slate-300"
                />
              </label>
              <label className={`block ${settings.useGradientBackground ? '' : 'opacity-45'}`}>
                <span className="mb-1 block text-xs font-bold text-slate-500">结束颜色</span>
                <input
                  type="color"
                  value={settings.backgroundEnd}
                  onChange={(event) => updateBackgroundColor('backgroundEnd', event.target.value)}
                  disabled={!settings.useGradientBackground}
                  className="h-11 w-full rounded-md border border-slate-300 disabled:cursor-not-allowed"
                />
              </label>
            </div>

            <label className="mt-3 block text-xs font-bold text-slate-500">布局</label>
            <select
              value={settings.layoutMode}
              onChange={(event) => updateSettings('layoutMode', event.target.value as PosterLayoutMode)}
              className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-base md:text-sm"
            >
              <option value="auto">自动</option>
              <option value="1x1">1 x 1</option>
              <option value="1x2">1 x 2</option>
              <option value="2x1">2 x 1</option>
              <option value="2x2">2 x 2</option>
              <option value="3x2">3 x 2</option>
              <option value="4x2">4 x 2</option>
              <option value="5x2">5 x 2</option>
              <option value="5x3">5 x 3</option>
            </select>

            <button
              type="button"
              role="switch"
              aria-checked={isFreeLayoutOpen}
              onClick={() => setIsFreeLayoutOpen(true)}
              disabled={posterLayers.length === 0}
              className="mt-3 flex min-h-12 w-full items-center justify-between rounded-md border border-slate-300 bg-slate-50 px-3 text-left text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span>
                解锁自由布局
                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                  全屏拖动、缩放、旋转文字和图片
                </span>
              </span>
              <span className={`relative h-7 w-12 rounded-full transition ${isFreeLayoutOpen ? 'bg-orange-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${isFreeLayoutOpen ? 'left-6' : 'left-1'}`} />
              </span>
            </button>
            {customTransforms && (
              <div className="mt-2 flex items-center justify-between rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                <span>已应用自定义布局</span>
                <button type="button" onClick={() => setCustomTransforms(null)} className="underline underline-offset-2">恢复自动布局</button>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black">图片处理</h2>
            <label className="mt-3 block text-xs font-bold text-slate-500">抠图方式</label>
            <select
              value={settings.backgroundRemovalMode}
              onChange={(event) =>
                updateSettings('backgroundRemovalMode', event.target.value as BackgroundRemovalMode)
              }
              className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-base md:text-sm"
            >
              <option value="local">本地算法抠图</option>
              <option value="model">模型抠图</option>
              <option value="none">不抠图</option>
            </select>
            {[
              ['pixelate', '转为适合拼图的像素图'],
              ['addOutline', '添加白色描边'],
            ].map(([key, label]) => (
              <label key={key} className="mt-3 flex items-center justify-between text-sm font-semibold">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(settings[key as keyof PosterSettings])}
                  onChange={(event) =>
                    updateSettings(
                      key as keyof PosterSettings,
                      event.target.checked as never
                    )
                  }
                  className="h-6 w-6"
                />
              </label>
            ))}
            <p className="mt-3 text-xs leading-5 text-slate-500">
              本地算法使用浏览器 Canvas 处理纯色或边缘背景；模型抠图首次运行会下载 ONNX/WASM 模型资源，失败时会自动退回本地算法。
            </p>
          </section>
        </aside>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div id="poster-preview" className="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="flex items-center justify-between pb-3">
              <h2 className="text-sm font-black">预览</h2>
              <div className="text-xs text-slate-500">1080 x 1440</div>
            </div>
            <div className="flex justify-center overflow-auto rounded-md bg-slate-200 p-2 sm:p-4">
              <canvas
                ref={canvasRef}
                className="h-auto w-full max-w-[620px] bg-white shadow-lg"
                style={{ aspectRatio: '3 / 4' }}
              />
            </div>
          </div>

          <div id="poster-items" className="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black">图片与文字</h2>
              {items.length > 0 && (
                <button
                  onClick={() => {
                    setItems([]);
                    setCustomTransforms(null);
                  }}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  清空
                </button>
              )}
            </div>

            <div className="mt-3 max-h-none space-y-3 overflow-visible pr-0 xl:max-h-[calc(100vh-150px)] xl:overflow-auto xl:pr-1">
              {items.length === 0 && (
                <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  暂无图片
                </div>
              )}

              {items.map((item, index) => (
                <div key={item.id} className="rounded-md border border-slate-200 p-3">
                  <div className="flex gap-3">
                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-slate-100 sm:h-20 sm:w-20">
                      <img
                        src={item.processedSrc || item.originalSrc}
                        alt={item.label}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-900 px-2 py-1 text-xs font-black text-white">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <input
                          value={item.label}
                          placeholder={item.sourceName || '输入图片名称'}
                          onChange={(event) => updateItemLabel(item.id, event.target.value)}
                          className="min-h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-base md:text-sm"
                        />
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full ${
                            item.status === 'error' ? 'bg-red-500' : 'bg-orange-500'
                          }`}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.error || item.progressText}
                        {item.backgroundMethod === 'model' ? ' · 模型' : ''}
                        {item.backgroundMethod === 'local' ? ' · 本地' : ''}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <button
                      type="button"
                      onClick={() => setWatermarkItemId(item.id)}
                      disabled={item.status === 'processing' || isBatchProcessing}
                      className="min-h-10 rounded-md border border-amber-300 bg-amber-50 px-2 py-2 text-xs font-bold text-amber-800 disabled:opacity-45"
                    >
                      框选去水印
                    </button>
                    <button
                      onClick={() => processItem(item.id)}
                      disabled={item.status === 'processing' || isBatchProcessing}
                      className="min-h-10 rounded-md bg-slate-900 px-2 py-2 text-xs font-bold text-white disabled:opacity-45"
                    >
                      处理
                    </button>
                    <button
                      onClick={() => moveItem(item.id, -1)}
                      disabled={index === 0}
                      className="min-h-10 rounded-md border border-slate-300 px-2 py-2 text-xs font-bold disabled:opacity-35"
                    >
                      上移
                    </button>
                    <button
                      onClick={() => moveItem(item.id, 1)}
                      disabled={index === items.length - 1}
                      className="min-h-10 rounded-md border border-slate-300 px-2 py-2 text-xs font-bold disabled:opacity-35"
                    >
                      下移
                    </button>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="min-h-10 rounded-md border border-red-200 px-2 py-2 text-xs font-bold text-red-600"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm font-black text-slate-800"
          >
            上传
          </button>
          <button
            onClick={processAll}
            disabled={!items.length || isBatchProcessing}
            className="min-h-11 rounded-md bg-orange-500 px-3 py-2 text-sm font-black text-white disabled:opacity-45"
          >
            {isBatchProcessing ? '处理中' : '处理'}
          </button>
          <button
            onClick={downloadPoster}
            disabled={!items.length}
            className="min-h-11 rounded-md bg-slate-950 px-3 py-2 text-sm font-black text-white disabled:opacity-45"
          >
            导出
          </button>
        </div>
      </div>
      {watermarkItem && (
        <WatermarkRemovalModal
          imageSrc={watermarkItem.originalSrc}
          isOpen
          onClose={() => setWatermarkItemId(null)}
          onContinue={(cleanedImageSrc) => applyWatermarkRemoval(watermarkItem.id, cleanedImageSrc)}
          title="封面图片手动去水印"
          description="拖动黄色选区覆盖水印，可连续处理多个区域；完成后返回封面排版。"
          continueLabel="不处理并返回"
          completedContinueLabel="完成并返回封面"
          completedMessage="可继续框选或返回封面排版。"
        />
      )}
      <PosterFreeLayoutModal
        isOpen={isFreeLayoutOpen}
        layers={posterLayers}
        initialTransforms={customTransforms}
        initialTextStyles={textStyleOverrides}
        backgroundStart={settings.backgroundStart}
        backgroundEnd={settings.backgroundEnd}
        useGradientBackground={settings.useGradientBackground}
        onClose={() => setIsFreeLayoutOpen(false)}
        onApply={(transforms, textStyles) => {
          setCustomTransforms(transforms);
          setTextStyleOverrides(textStyles);
          setIsFreeLayoutOpen(false);
        }}
        onReset={() => setCustomTransforms(null)}
      />
    </main>
  );
}
