'use client';

import {
  PaletteColor,
  RgbColor,
  colorDistance,
  findClosestPaletteColor,
  hexToRgb,
} from './pixelation';
import { getMardToHexMapping } from './colorSystemUtils';

export type BackgroundRemovalMethod = 'model' | 'local' | 'none';
export type BackgroundRemovalMode = 'model' | 'local' | 'none';

export interface PosterProcessOptions {
  backgroundRemovalMode: BackgroundRemovalMode;
  pixelate: boolean;
  addOutline: boolean;
  onProgress?: (message: string, progress?: number) => void;
}

export interface PosterProcessResult {
  dataUrl: string;
  backgroundMethod: BackgroundRemovalMethod;
}

const mardPalette: PaletteColor[] = Object.entries(getMardToHexMapping())
  .map(([key, hex]) => {
    const rgb = hexToRgb(hex);
    return rgb ? { key, hex, rgb } : null;
  })
  .filter((color): color is PaletteColor => color !== null);

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(parts[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('无法读取处理后的图片'));
      }
    };
    reader.onerror = () => reject(new Error('无法读取处理后的图片'));
    reader.readAsDataURL(blob);
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('无法读取图片'));
      }
    };
    reader.onerror = () => reject(new Error('无法读取图片'));
    reader.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

async function normalizeImage(src: string, maxSide = 1280): Promise<string> {
  const img = await loadImage(src);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建图片处理画布');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return canvasToDataUrl(canvas);
}

async function removeBackgroundWithModel(
  src: string,
  onProgress?: PosterProcessOptions['onProgress']
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('模型抠图只能在浏览器中运行');
  }

  onProgress?.('加载抠图模型', 5);
  const mod = await import('@imgly/background-removal');
  const blob = dataUrlToBlob(await normalizeImage(src, 1400));
  const result = await mod.removeBackground(blob, {
    model: 'isnet_quint8',
    device: 'cpu',
    output: { format: 'image/png', quality: 1 },
    progress: (key, current, total) => {
      if (!total) return;
      const percent = Math.min(70, Math.round((current / total) * 65));
      onProgress?.(`下载模型资源 ${key}`, percent);
    },
  });
  onProgress?.('模型抠图完成', 72);
  return blobToDataUrl(result);
}

function averageBorderColor(imageData: ImageData): RgbColor {
  const { width, height, data } = imageData;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  const sample = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    if (data[index + 3] < 64) return;
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
    count++;
  };

  for (let x = 0; x < width; x++) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    sample(0, y);
    sample(width - 1, y);
  }

  if (!count) return { r: 255, g: 255, b: 255 };
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
}

async function removeBackgroundByEdges(src: string): Promise<string> {
  const img = await loadImage(src);
  const scale = Math.min(1, 1100 / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('无法创建去背景画布');

  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const bg = averageBorderColor(imageData);
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const threshold = 48;

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const key = y * width + x;
    if (visited[key]) return;
    const index = key * 4;
    if (data[index + 3] < 24) {
      visited[key] = 1;
      return;
    }
    const distance = colorDistance(
      { r: data[index], g: data[index + 1], b: data[index + 2] },
      bg
    );
    if (distance > threshold) return;
    visited[key] = 1;
    stack.push(key);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length) {
    const key = stack.pop()!;
    const x = key % width;
    const y = Math.floor(key / width);
    data[key * 4 + 3] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  ctx.putImageData(imageData, 0, 0);
  return trimTransparent(canvasToDataUrl(canvas), 18);
}

async function trimTransparent(src: string, padding = 12): Promise<string> {
  const img = await loadImage(src);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('无法创建透明裁切画布');
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] > 24) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return src;

  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(canvas.width - 1, maxX + padding);
  maxY = Math.min(canvas.height - 1, maxY + padding);

  const out = createCanvas(maxX - minX + 1, maxY - minY + 1);
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('无法创建透明裁切输出画布');
  outCtx.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return canvasToDataUrl(out);
}

async function pixelateForPuzzle(src: string): Promise<string> {
  const img = await loadImage(src);
  const maxCells = 82;
  const scale = maxCells / Math.max(img.width, img.height);
  const lowWidth = Math.max(12, Math.round(img.width * scale));
  const lowHeight = Math.max(12, Math.round(img.height * scale));
  const low = createCanvas(lowWidth, lowHeight);
  const lowCtx = low.getContext('2d', { willReadFrequently: true });
  if (!lowCtx) throw new Error('无法创建像素化画布');

  lowCtx.imageSmoothingEnabled = true;
  lowCtx.imageSmoothingQuality = 'high';
  lowCtx.drawImage(img, 0, 0, lowWidth, lowHeight);
  const imageData = lowCtx.getImageData(0, 0, lowWidth, lowHeight);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 64) {
      data[i + 3] = 0;
      continue;
    }

    const closest = findClosestPaletteColor(
      { r: data[i], g: data[i + 1], b: data[i + 2] },
      mardPalette
    );
    data[i] = closest.rgb.r;
    data[i + 1] = closest.rgb.g;
    data[i + 2] = closest.rgb.b;
    data[i + 3] = 255;
  }

  lowCtx.putImageData(imageData, 0, 0);

  const pixelSize = 7;
  const out = createCanvas(lowWidth * pixelSize, lowHeight * pixelSize);
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('无法创建像素化输出画布');
  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(low, 0, 0, out.width, out.height);
  return trimTransparent(canvasToDataUrl(out), 12);
}

async function addWhiteOutline(src: string, radius = 8): Promise<string> {
  const img = await loadImage(src);
  const padding = radius + 8;
  const out = createCanvas(img.width + padding * 2, img.height + padding * 2);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('无法创建描边画布');

  const outline = createCanvas(out.width, out.height);
  const outlineCtx = outline.getContext('2d');
  if (!outlineCtx) throw new Error('无法创建描边遮罩');

  for (let y = -radius; y <= radius; y += 2) {
    for (let x = -radius; x <= radius; x += 2) {
      if (x * x + y * y <= radius * radius) {
        outlineCtx.drawImage(img, padding + x, padding + y);
      }
    }
  }

  outlineCtx.globalCompositeOperation = 'source-in';
  outlineCtx.fillStyle = '#ffffff';
  outlineCtx.fillRect(0, 0, outline.width, outline.height);

  ctx.drawImage(outline, 0, 0);
  ctx.drawImage(img, padding, padding);
  return canvasToDataUrl(out);
}

export async function processPosterImage(
  src: string,
  options: PosterProcessOptions
): Promise<PosterProcessResult> {
  let current = src;
  let backgroundMethod: BackgroundRemovalMethod = 'none';

  if (options.backgroundRemovalMode !== 'none') {
    if (options.backgroundRemovalMode === 'model') {
      try {
        current = await removeBackgroundWithModel(current, options.onProgress);
        backgroundMethod = 'model';
      } catch (error) {
        console.warn('Model background removal failed, falling back to local removal:', error);
        options.onProgress?.('模型抠图失败，使用本地算法兜底', 72);
        current = await removeBackgroundByEdges(current);
        backgroundMethod = 'local';
      }
    } else {
      options.onProgress?.('使用本地算法抠图', 30);
      current = await removeBackgroundByEdges(current);
      backgroundMethod = 'local';
    }
  } else {
    current = await normalizeImage(current, 1200);
  }

  if (options.pixelate) {
    options.onProgress?.('转换为拼图像素风格', 82);
    current = await pixelateForPuzzle(current);
  } else {
    current = await trimTransparent(current, 10);
  }

  if (options.addOutline) {
    options.onProgress?.('添加白色描边', 92);
    current = await addWhiteOutline(current, options.pixelate ? 8 : 6);
  }

  options.onProgress?.('处理完成', 100);
  return { dataUrl: current, backgroundMethod };
}
