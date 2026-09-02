import { transparentColorData } from './pixelEditingUtils';
import {
  findClosestPerceptualPaletteColor,
} from './patternColorProcessing';
import { calculateRepresentativeRgbGrid } from './sourceGridSampling';

// 定义像素化模式
export enum PixelationMode {
  Dominant = 'dominant', // 卡通模式（主色）
  Average = 'average',   // 真实模式（平均色）
}

// 定义色号系统类型
export type ColorSystem = '通用221色' | 'MARD' | 'COCO' | '漫漫' | '盼盼' | '咪小窝';

// --- 必要的类型定义 ---
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface PaletteColor {
  key: string;
  hex: string;
  rgb: RgbColor;
}

export interface MappedPixel {
  key: string;
  color: string;
  isExternal?: boolean;
  sourceRgb?: RgbColor;
}

// --- 辅助函数 ---

// 转换 Hex 到 RGB
export function hexToRgb(hex: string): RgbColor | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// 计算颜色距离
export function colorDistance(rgb1: RgbColor, rgb2: RgbColor): number {
  const dr = rgb1.r - rgb2.r;
  const dg = rgb1.g - rgb2.g;
  const db = rgb1.b - rgb2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// 查找最接近的颜色
export function findClosestPaletteColor(
  targetRgb: RgbColor,
  palette: PaletteColor[]
): PaletteColor {
  if (!palette || palette.length === 0) {
      console.error("findClosestPaletteColor: Palette is empty or invalid!");
      // 提供一个健壮的回退
      return { key: 'ERR', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } };
  }

  return findClosestPerceptualPaletteColor(targetRgb, palette);
}


// --- 核心像素化计算逻辑 ---

/**
 * 根据原始图像数据、网格尺寸、调色板和模式计算像素化网格数据。
 * @param originalCtx 原始图像的 Canvas 2D Context
 * @param imgWidth 原始图像宽度
 * @param imgHeight 原始图像高度
 * @param N 网格横向数量
 * @param M 网格纵向数量
 * @param palette 当前使用的调色板
 * @param mode 像素化模式 (Dominant/Average)
 * @param t1FallbackColor T1 或其他备用颜色数据
 * @returns 计算后的 MappedPixel 网格数据
 */
export function calculatePixelGrid(
    originalCtx: CanvasRenderingContext2D,
    imgWidth: number,
    imgHeight: number,
    N: number,
    M: number,
    palette: PaletteColor[],
    mode: PixelationMode,
    t1FallbackColor: PaletteColor // 传入备用色
): MappedPixel[][] {
    console.log(`Calculating pixel grid with mode: ${mode}`);
    const mappedData: MappedPixel[][] = Array(M).fill(null).map(() => Array(N).fill({ key: t1FallbackColor.key, color: t1FallbackColor.hex }));
    let fullImageData: ImageData | null = null;
    try {
        fullImageData = originalCtx.getImageData(0, 0, imgWidth, imgHeight);
    } catch (e) {
        console.error("Failed to get full image data:", e);
        // 如果无法获取图像数据，返回一个空的或默认的网格
        return mappedData;
    }

    const representativeGrid = calculateRepresentativeRgbGrid(
        fullImageData.data,
        imgWidth,
        imgHeight,
        N,
        M,
        mode,
    );

    for (let j = 0; j < M; j++) {
        for (let i = 0; i < N; i++) {
            const representativeRgb = representativeGrid[j]?.[i] ?? null;

            let finalCellColorData: MappedPixel;
            if (representativeRgb) {
                const closestBead = findClosestPaletteColor(representativeRgb, palette);
                finalCellColorData = {
                    key: closestBead.key,
                    color: closestBead.hex,
                    sourceRgb: representativeRgb,
                };
            } else {
                // 如果单元格为空或全透明，标记为透明/外部
                finalCellColorData = { ...transparentColorData };
            }
            mappedData[j][i] = finalCellColorData;
        }
    }
    console.log(`Pixel grid calculation complete for mode: ${mode}`);
    return mappedData;
} 
