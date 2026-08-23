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
import {
  BackgroundRemovalMode,
  BackgroundRemovalMethod,
  loadImage,
  processPosterImage,
  readFileAsDataUrl,
} from '../../utils/posterProcessing';

type LayoutMode = 'auto' | '1x1' | '1x2' | '2x1' | '2x2' | '3x2' | '4x2' | '5x2' | '5x3';
type ItemStatus = 'idle' | 'processing' | 'done' | 'error';

interface PosterItem {
  id: string;
  originalSrc: string;
  processedSrc: string;
  label: string;
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
  layoutMode: LayoutMode;
  backgroundRemovalMode: BackgroundRemovalMode;
  pixelate: boolean;
  addOutline: boolean;
}

const defaultSettings: PosterSettings = {
  title: '',
  subtitle: '',
  bottomTitle: '',
  fixedText: '图纸在粉丝群',
  backgroundStart: '#58C7C2',
  backgroundEnd: '#F4F7F5',
  layoutMode: 'auto',
  backgroundRemovalMode: 'local',
  pixelate: true,
  addOutline: true,
};

const backgroundPresets = [
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

interface PosterLayout {
  cols: number;
  rows: number;
  capacity: number;
}

const fixedLayouts: Record<Exclude<LayoutMode, 'auto'>, PosterLayout> = {
  '1x1': { cols: 1, rows: 1, capacity: 1 },
  '1x2': { cols: 1, rows: 2, capacity: 2 },
  '2x1': { cols: 2, rows: 1, capacity: 2 },
  '2x2': { cols: 2, rows: 2, capacity: 4 },
  '3x2': { cols: 3, rows: 2, capacity: 6 },
  '4x2': { cols: 4, rows: 2, capacity: 8 },
  '5x2': { cols: 5, rows: 2, capacity: 10 },
  '5x3': { cols: 5, rows: 3, capacity: 15 },
};

function getPosterLayout(count: number, mode: LayoutMode): PosterLayout {
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
  if (layout.cols === 1 && layout.rows === 1) {
    return { x: 120, y: 320, width: 840, height: 670 };
  }
  if (layout.cols === 1 && layout.rows === 2) {
    return { x: 160, y: 318, width: 760, height: 690 };
  }
  if (layout.cols === 2 && layout.rows === 1) {
    return { x: 90, y: 340, width: 900, height: 620 };
  }
  if (layout.rows === 2) {
    return { x: 86, y: 360, width: 908, height: 600 };
  }
  return { x: 86, y: 320, width: 908, height: 650 };
}

function getImageBounds(layout: PosterLayout, cellWidth: number, cellHeight: number) {
  if (layout.cols === 1 && layout.rows === 1) {
    return {
      maxWidth: Math.min(560, cellWidth * 0.78),
      maxHeight: Math.min(440, cellHeight * 0.66),
      imageCenterRatio: 0.45,
      labelRatio: 0.84,
      labelFontSize: 28,
    };
  }
  if (layout.cols === 1 && layout.rows === 2) {
    return {
      maxWidth: Math.min(430, cellWidth * 0.72),
      maxHeight: Math.min(238, cellHeight * 0.7),
      imageCenterRatio: 0.44,
      labelRatio: 0.82,
      labelFontSize: 26,
    };
  }
  if (layout.cols === 2 && layout.rows === 1) {
    return {
      maxWidth: Math.min(340, cellWidth * 0.76),
      maxHeight: Math.min(360, cellHeight * 0.62),
      imageCenterRatio: 0.46,
      labelRatio: 0.82,
      labelFontSize: 26,
    };
  }
  if (layout.cols === 2) {
    return {
      maxWidth: Math.min(300, cellWidth * 0.72),
      maxHeight: Math.min(230, cellHeight * 0.68),
      imageCenterRatio: 0.42,
      labelRatio: 0.82,
      labelFontSize: 24,
    };
  }
  return {
    maxWidth: Math.min(layout.rows > 2 ? 168 : 190, cellWidth * 0.82),
    maxHeight: Math.min(layout.rows > 2 ? 146 : 190, cellHeight * 0.64),
    imageCenterRatio: 0.42,
    labelRatio: 0.82,
    labelFontSize: 23,
  };
}

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
  stroke?: { color: string; width: number }
) {
  let size = startSize;
  do {
    ctx.font = `900 ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth || size <= minSize) break;
    size -= 2;
  } while (size > minSize);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (stroke) {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
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
  settings: PosterSettings
) {
  const width = 1080;
  const height = 1440;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, settings.backgroundStart);
  gradient.addColorStop(1, settings.backgroundEnd);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawTextFit(
    ctx,
    settings.title || 'TITLE',
    width / 2,
    150,
    780,
    76,
    42,
    'Impact, Arial Black, sans-serif',
    '#ffffff',
    { color: '#24160f', width: 12 }
  );

  ctx.font = '400 30px Arial, sans-serif';
  ctx.fillStyle = 'rgba(52, 34, 23, 0.88)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(settings.subtitle || '', width / 2, 242);

  const layout = getPosterLayout(items.length, settings.layoutMode);
  const visibleItems = items.slice(0, layout.capacity);
  const count = visibleItems.length;
  const cols = layout.cols;
  const rows = layout.rows;
  const visibleRows = layout.cols === 1 ? Math.max(1, Math.min(layout.rows, count)) : rows;
  const area = getPosterItemArea(layout);
  const cellWidth = area.width / cols;
  const cellHeight = area.height / visibleRows;
  const imageBounds = getImageBounds(layout, cellWidth, cellHeight);

  const loadedImages = await Promise.all(
    visibleItems.map(async (item) => {
      try {
        return await loadImage(item.processedSrc || item.originalSrc);
      } catch {
        return null;
      }
    })
  );

  visibleItems.forEach((item, index) => {
    const img = loadedImages[index];
    const row = Math.floor(index / cols);
    const col = index % cols;
    const centerX = area.x + col * cellWidth + cellWidth / 2;
    const cellTop = area.y + row * cellHeight;
    const imageCenterY = cellTop + cellHeight * imageBounds.imageCenterRatio;
    const labelY = cellTop + cellHeight * imageBounds.labelRatio;

    if (img) {
      drawContainImage(ctx, img, centerX, imageCenterY, imageBounds.maxWidth, imageBounds.maxHeight, true);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.fillRect(centerX - 58, imageCenterY - 58, 116, 116);
    }

    ctx.font = `600 ${imageBounds.labelFontSize}px Arial, sans-serif`;
    ctx.fillStyle = 'rgba(54, 38, 28, 0.92)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = item.label || '未命名';
    ctx.fillText(label, centerX, labelY, cellWidth - 16);
  });

  if (count === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '700 34px Arial, sans-serif';
    ctx.fillText('上传图片后自动生成排版预览', width / 2, 650);
  }

  drawTextFit(
    ctx,
    settings.bottomTitle || '自定义标题',
    width / 2,
    1146,
    840,
    92,
    48,
    'Arial Black, PingFang SC, Microsoft YaHei, sans-serif',
    '#ffffff',
    { color: '#050505', width: 14 }
  );

  drawTextFit(
    ctx,
    settings.fixedText,
    width / 2,
    1266,
    760,
    56,
    36,
    'Arial Black, PingFang SC, Microsoft YaHei, sans-serif',
    '#ffffff',
    { color: '#050505', width: 10 }
  );
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function filenameToLabel(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || '未命名';
}

export default function PosterPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<PosterItem[]>([]);
  const [settings, setSettings] = useState<PosterSettings>(defaultSettings);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const processedCount = useMemo(
    () => items.filter((item) => item.status === 'done').length,
    [items]
  );

  const updateSettings = <K extends keyof PosterSettings>(key: K, value: PosterSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderPosterCanvas(canvas, items, settings).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [items, settings]);

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
          label: filenameToLabel(file.name),
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
    await renderPosterCanvas(canvas, items, settings);
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
            <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6">
              {backgroundPresets.map(([start, end]) => (
                <button
                  key={`${start}-${end}`}
                  type="button"
                  onClick={() =>
                    setSettings((prev) => ({ ...prev, backgroundStart: start, backgroundEnd: end }))
                  }
                  className="h-10 rounded-md border border-slate-300 sm:h-8"
                  style={{ background: `linear-gradient(90deg, ${start}, ${end})` }}
                  aria-label="选择背景色"
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                type="color"
                value={settings.backgroundStart}
                onChange={(event) => updateSettings('backgroundStart', event.target.value)}
                className="h-11 w-full rounded-md border border-slate-300"
              />
              <input
                type="color"
                value={settings.backgroundEnd}
                onChange={(event) => updateSettings('backgroundEnd', event.target.value)}
                className="h-11 w-full rounded-md border border-slate-300"
              />
            </div>

            <label className="mt-3 block text-xs font-bold text-slate-500">布局</label>
            <select
              value={settings.layoutMode}
              onChange={(event) => updateSettings('layoutMode', event.target.value as LayoutMode)}
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
                  onClick={() => setItems([])}
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
                          placeholder="如：成龙、小玉、老爹、特鲁、布莱克警长、毒蛇、瓦龙、刀龙"
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

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
    </main>
  );
}
