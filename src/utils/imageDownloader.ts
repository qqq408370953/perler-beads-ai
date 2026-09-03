import { GridDownloadOptions } from '../types/downloadTypes';
import { MappedPixel, PaletteColor } from './pixelation';
import { getMappedColorDisplayKey, getColorKeyByHex, ColorSystem } from './colorSystemUtils';
import { cropPixelDataToContent, TRANSPARENT_KEY } from './pixelEditingUtils';
import {
  calculateSocialPreviewCellSize,
  calculateSocialPreviewStatsLayout,
  getSocialPreviewCrossSegments,
  getSocialPreviewGridLineStyles,
  isSocialPreviewBackgroundCell,
} from './socialPreviewImage';

// 用于获取对比色的工具函数 - 从page.tsx复制
function getContrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000'; // Default to black
  // Simple brightness check (Luma formula Y = 0.2126 R + 0.7152 G + 0.0722 B)
  const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luma > 0.5 ? '#000000' : '#FFFFFF'; // Dark background -> white text, Light background -> black text
}

// 辅助函数：将十六进制颜色转换为RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const formattedHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(formattedHex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// 用于排序颜色键的函数 - 从page.tsx复制
function sortColorKeys(a: string, b: string): number {
  const regex = /^([A-Z]+)(\d+)$/;
  const matchA = a.match(regex);
  const matchB = b.match(regex);

  if (matchA && matchB) {
    const prefixA = matchA[1];
    const numA = parseInt(matchA[2], 10);
    const prefixB = matchB[1];
    const numB = parseInt(matchB[2], 10);

    if (prefixA !== prefixB) {
      return prefixA.localeCompare(prefixB); // Sort by prefix first (A, B, C...)
    }
    return numA - numB; // Then sort by number (1, 2, 10...)
  }
  // Fallback for keys that don't match the standard pattern (e.g., T1, ZG1)
  return a.localeCompare(b);
}

// 导出CSV hex数据的函数
export function exportCsvData({
  mappedPixelData,
  gridDimensions,
  selectedColorSystem
}: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  selectedColorSystem: ColorSystem;
}): void {
  if (!mappedPixelData || !gridDimensions) {
    console.error("导出失败: 映射数据或尺寸无效。");
    alert("无法导出CSV，数据未生成或无效。");
    return;
  }

  const croppedPattern = cropPixelDataToContent(mappedPixelData, 1);
  const exportPixelData = croppedPattern.mappedPixelData;
  const { N, M } = croppedPattern.gridDimensions;
  
  // 生成CSV内容，每行代表图纸的一行
  const csvLines: string[] = [];
  
  for (let row = 0; row < M; row++) {
    const rowData: string[] = [];
    for (let col = 0; col < N; col++) {
      const cellData = exportPixelData[row][col];
      if (cellData && !cellData.isExternal) {
        // 内部单元格，记录hex颜色值
        rowData.push(cellData.color);
      } else {
        // 外部单元格或空白，使用特殊标记
        rowData.push('TRANSPARENT');
      }
    }
    csvLines.push(rowData.join(','));
  }

  // 创建CSV内容
  const csvContent = csvLines.join('\n');
  
  // 创建并下载CSV文件
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `bead-pattern-${N}x${M}-${selectedColorSystem}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // 释放URL对象
  URL.revokeObjectURL(url);
  
  console.log("CSV数据导出完成");
}

// 导入CSV hex数据的函数
export function importCsvData(file: File): Promise<{
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          reject(new Error('无法读取文件内容'));
          return;
        }
        
        // 解析CSV内容
        const lines = text.trim().split('\n');
        const M = lines.length; // 行数
        
        if (M === 0) {
          reject(new Error('CSV文件为空'));
          return;
        }
        
        // 解析第一行获取列数
        const firstRowData = lines[0].split(',');
        const N = firstRowData.length; // 列数
        
        if (N === 0) {
          reject(new Error('CSV文件格式无效'));
          return;
        }
        
        // 创建映射数据
        const mappedPixelData: MappedPixel[][] = [];
        
        for (let row = 0; row < M; row++) {
          const rowData = lines[row].split(',');
          const mappedRow: MappedPixel[] = [];
          
          // 确保每行都有正确的列数
          if (rowData.length !== N) {
            reject(new Error(`第${row + 1}行的列数不匹配，期望${N}列，实际${rowData.length}列`));
            return;
          }
          
          for (let col = 0; col < N; col++) {
            const cellValue = rowData[col].trim();
            
            if (cellValue === 'TRANSPARENT' || cellValue === '') {
              // 外部/透明单元格
              mappedRow.push({
                key: 'TRANSPARENT',
                color: '#FFFFFF',
                isExternal: true
              });
            } else {
              // 验证hex颜色格式
              const hexPattern = /^#[0-9A-Fa-f]{6}$/;
              if (!hexPattern.test(cellValue)) {
                reject(new Error(`第${row + 1}行第${col + 1}列的颜色值无效：${cellValue}`));
                return;
              }
              
              // 内部单元格
              mappedRow.push({
                key: cellValue.toUpperCase(),
                color: cellValue.toUpperCase(),
                isExternal: false
              });
            }
          }
          
          mappedPixelData.push(mappedRow);
        }
        
        // 返回解析结果
        resolve({
          mappedPixelData,
          gridDimensions: { N, M }
        });
        
      } catch (error) {
        reject(new Error(`解析CSV文件失败：${error}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('读取文件失败'));
    };
    
    reader.readAsText(file, 'utf-8');
  });
}

interface DownloadImageParams {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  colorCounts: { [key: string]: { count: number; color: string; displayKey?: string } } | null;
  totalBeadCount: number;
  options: GridDownloadOptions;
  activeBeadPalette: PaletteColor[];
  selectedColorSystem: ColorSystem;
}

export interface DownloadImagePreviewResult {
  imageUrl: string;
  blob: Blob;
  filename: string;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Canvas 转换为图片失败'));
      }
    }, 'image/png');
  });
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('图片转换失败'));
      }
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(blob);
  });
}

function triggerDataUrlDownload(dataURL: string, filename: string): void {
  const link = document.createElement('a');

  link.href = dataURL;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function releaseDownloadImagePreviewUrl(imageUrl?: string | null): void {
  if (imageUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(imageUrl);
  }
}

function getDownloadCellSize(N: number, M: number): number {
  // Keep the downloadable original dense enough for local zooming. The
  // competitor-style layout previously reduced large patterns to 10-14 px per
  // cell, which made grid lines and labels visibly soft after zooming. This
  // restores the earlier 30 px target while still capping very large grids.
  const maxGridSide = 7200;
  const largestSide = Math.max(N, M);
  if (largestSide <= 0) return 30;

  return Math.max(8, Math.min(30, Math.floor(maxGridSide / largestSide)));
}

export async function saveImageBlob(blob: Blob, filename: string): Promise<void> {
  const dataURL = await blobToDataURL(blob);
  triggerDataUrlDownload(dataURL, filename);
}

// 生成最终图纸图片，用于预览或下载
export async function generateDownloadImagePreview({
  mappedPixelData,
  gridDimensions,
  colorCounts,
  totalBeadCount,
  options,
  activeBeadPalette,
  selectedColorSystem
}: DownloadImageParams, variant: 'high-resolution' | 'social-preview' = 'high-resolution'): Promise<DownloadImagePreviewResult | null> {
  if (!mappedPixelData || !gridDimensions || gridDimensions.N === 0 || gridDimensions.M === 0 || activeBeadPalette.length === 0) {
    console.error('下载失败: 映射数据或尺寸无效。');
    alert('无法生成图纸，数据未生成或无效。');
    return null;
  }
  if (!colorCounts) {
    console.error('下载失败: 色号统计数据无效。');
    alert('无法生成图纸，色号统计数据未生成或无效。');
    return null;
  }

  const { N, M } = gridDimensions;
  const isSocialPreview = variant === 'social-preview';
  const socialGridLineStyles = getSocialPreviewGridLineStyles();
  const cellSize = isSocialPreview
    ? calculateSocialPreviewCellSize({ N, M })
    : getDownloadCellSize(N, M);
  const {
    showGrid,
    gridInterval,
    showCoordinates,
    gridLineColor,
    includeStats,
    showCellNumbers = true,
  } = options;
  const coordinateBand = showCoordinates ? Math.max(14, Math.ceil(cellSize * 0.72)) : 0;
  const pagePadding = 12;
  const headerHeight = Math.max(34, Math.min(46, Math.round(cellSize * 1.7)));
  const gridWidth = N * cellSize;
  const gridHeight = M * cellSize;
  const sheetWidth = pagePadding * 2 + coordinateBand * 2 + gridWidth;
  const colorKeys = Object.keys(colorCounts).sort(sortColorKeys);
  const availableStatsWidth = sheetWidth - pagePadding * 2;
  const socialStatsLayout = calculateSocialPreviewStatsLayout(colorKeys.length, availableStatsWidth);
  const statsGap = includeStats && colorKeys.length > 0 ? (isSocialPreview ? 18 : 28) : 0;
  const statsColumns = isSocialPreview
    ? socialStatsLayout.columns
    : Math.max(1, Math.min(10, Math.floor(availableStatsWidth / 120)));
  const statsRows = isSocialPreview
    ? socialStatsLayout.rows
    : Math.ceil(colorKeys.length / statsColumns);
  const statsHeight = includeStats && colorKeys.length > 0
    ? isSocialPreview
      ? socialStatsLayout.height
      : 54 + statsRows * 68 + 34
    : 0;
  const sheetHeight = pagePadding * 2 + headerHeight + coordinateBand * 2 + gridHeight + statsGap + statsHeight;
  const canvas = document.createElement('canvas');
  canvas.width = sheetWidth;
  canvas.height = sheetHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    alert('无法生成图纸。');
    return null;
  }

  const sheetColor = isSocialPreview ? '#FBFAF5' : '#FFFEF8';
  const emptyCellColor = isSocialPreview ? '#FAF9F4' : '#FFFCEE';
  const minorLineColor = isSocialPreview ? socialGridLineStyles.minor.color : '#8D8980';
  const outerLineColor = isSocialPreview ? '#777168' : '#55524C';
  const majorLineColor = isSocialPreview
    ? socialGridLineStyles.major.color
    : gridLineColor || outerLineColor;
  const originX = pagePadding + coordinateBand;
  const originY = pagePadding + headerHeight + coordinateBand;
  const gridBottom = originY + gridHeight;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = sheetColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const headerTitle = `拼豆图纸生成器 / ${selectedColorSystem}`;
  const headerMeta = `${N}×${M} · ${colorKeys.length} 色 · ${totalBeadCount} 颗`;
  const headerFontSize = isSocialPreview
    ? Math.max(8, Math.min(12, Math.floor(sheetWidth / 92)))
    : Math.max(9, Math.min(15, Math.floor(sheetWidth / 72)));
  ctx.fillStyle = '#4B4741';
  ctx.font = `700 ${headerFontSize}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(headerTitle, pagePadding, pagePadding + headerHeight / 2);
  const headerTitleWidth = ctx.measureText(headerTitle).width;

  ctx.font = `500 ${Math.max(8, headerFontSize - 2)}px sans-serif`;
  const remainingHeaderWidth = sheetWidth - pagePadding * 2 - headerTitleWidth - 20;
  if (ctx.measureText(headerMeta).width <= remainingHeaderWidth) {
    ctx.fillStyle = '#777168';
    ctx.textAlign = 'right';
    ctx.fillText(headerMeta, sheetWidth - pagePadding, pagePadding + headerHeight / 2);
  }

  if (showCoordinates) {
    const axisFontSize = isSocialPreview
      ? Math.max(4, Math.min(7, Math.floor(cellSize * 0.3)))
      : Math.max(6, Math.min(10, Math.floor(cellSize * 0.34)));
    ctx.fillStyle = isSocialPreview ? '#77736C' : '#5F5B54';
    ctx.font = `500 ${axisFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let col = 0; col < N; col++) {
      const centerX = originX + col * cellSize + cellSize / 2;
      const label = String(col + 1);
      ctx.fillText(label, centerX, pagePadding + headerHeight + coordinateBand / 2);
      ctx.fillText(label, centerX, gridBottom + coordinateBand / 2);
    }

    for (let row = 0; row < M; row++) {
      const centerY = originY + row * cellSize + cellSize / 2;
      const label = String(row + 1);
      ctx.fillText(label, pagePadding + coordinateBand / 2, centerY);
      ctx.fillText(label, originX + gridWidth + coordinateBand / 2, centerY);
    }
  }

  const cellFontSize = isSocialPreview
    ? Math.max(3, Math.min(8, Math.floor(cellSize * 0.3)))
    : Math.max(5, Math.min(10, Math.floor(cellSize * 0.34)));
  const cellLabelFont = `500 ${cellFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  const backgroundCrossSegments = isSocialPreview ? getSocialPreviewCrossSegments(cellSize) : [];
  ctx.font = cellLabelFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (isSocialPreview) ctx.beginPath();

  for (let row = 0; row < M; row++) {
    for (let col = 0; col < N; col++) {
      const cell = mappedPixelData[row]?.[col];
      const drawX = originX + col * cellSize;
      const drawY = originY + row * cellSize;
      const isEmpty = isSocialPreview
        ? isSocialPreviewBackgroundCell(cell)
        : !cell || cell.isExternal || cell.key === TRANSPARENT_KEY;
      const cellColor = isEmpty ? emptyCellColor : cell.color || '#FFFFFF';

      ctx.fillStyle = cellColor;
      ctx.fillRect(drawX, drawY, cellSize, cellSize);

      if (isSocialPreview && isEmpty) {
        backgroundCrossSegments.forEach(([startX, startY, endX, endY]) => {
          ctx.moveTo(drawX + startX, drawY + startY);
          ctx.lineTo(drawX + endX, drawY + endY);
        });
      } else if (!isEmpty && showCellNumbers && cellSize >= 5) {
        const labelColor = getContrastColor(cellColor);
        ctx.fillStyle = labelColor;
        ctx.font = cellLabelFont;
        ctx.globalAlpha = isSocialPreview
          ? labelColor === '#FFFFFF' ? 0.56 : 0.72
          : 1;
        ctx.fillText(
          getMappedColorDisplayKey(cellColor, selectedColorSystem, cell!.key),
          drawX + cellSize / 2,
          drawY + cellSize / 2
        );
        ctx.globalAlpha = 1;
      }
    }
  }

  if (isSocialPreview) {
    ctx.strokeStyle = 'rgba(105, 101, 94, 0.34)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Use integer line widths and pixel-aligned coordinates. Fractional strokes
  // such as 0.75 px are anti-aliased by Canvas and look blurred when zoomed.
  if (isSocialPreview) {
    ctx.fillStyle = minorLineColor;
    for (let col = 1; col < N; col++) {
      ctx.fillRect(originX + col * cellSize, originY, socialGridLineStyles.minor.width, gridHeight);
    }
    for (let row = 1; row < M; row++) {
      ctx.fillRect(originX, originY + row * cellSize, gridWidth, socialGridLineStyles.minor.width);
    }
  } else {
    ctx.strokeStyle = minorLineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let col = 1; col < N; col++) {
      const lineX = originX + col * cellSize + 0.5;
      ctx.moveTo(lineX, originY);
      ctx.lineTo(lineX, gridBottom);
    }
    for (let row = 1; row < M; row++) {
      const lineY = originY + row * cellSize + 0.5;
      ctx.moveTo(originX, lineY);
      ctx.lineTo(originX + gridWidth, lineY);
    }
    ctx.stroke();
  }

  if (showGrid) {
    if (isSocialPreview) {
      ctx.fillStyle = majorLineColor;
      for (let col = Math.max(1, gridInterval); col < N; col += Math.max(1, gridInterval)) {
        ctx.fillRect(originX + col * cellSize, originY, socialGridLineStyles.major.width, gridHeight);
      }
      for (let row = Math.max(1, gridInterval); row < M; row += Math.max(1, gridInterval)) {
        ctx.fillRect(originX, originY + row * cellSize, gridWidth, socialGridLineStyles.major.width);
      }
    } else {
      ctx.strokeStyle = majorLineColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let col = Math.max(1, gridInterval); col < N; col += Math.max(1, gridInterval)) {
        const lineX = originX + col * cellSize;
        ctx.moveTo(lineX, originY);
        ctx.lineTo(lineX, gridBottom);
      }
      for (let row = Math.max(1, gridInterval); row < M; row += Math.max(1, gridInterval)) {
        const lineY = originY + row * cellSize;
        ctx.moveTo(originX, lineY);
        ctx.lineTo(originX + gridWidth, lineY);
      }
      ctx.stroke();
    }
  }

  if (isSocialPreview) {
    ctx.fillStyle = outerLineColor;
    ctx.fillRect(originX, originY, gridWidth, 1);
    ctx.fillRect(originX, gridBottom - 1, gridWidth, 1);
    ctx.fillRect(originX, originY, 1, gridHeight);
    ctx.fillRect(originX + gridWidth - 1, originY, 1, gridHeight);
  } else {
    ctx.strokeStyle = outerLineColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(originX, originY, gridWidth, gridHeight);
  }

  if (includeStats && colorKeys.length > 0) {
    const statsTop = gridBottom + coordinateBand + statsGap;
    const availableWidth = sheetWidth - pagePadding * 2;
    const itemWidth = availableWidth / statsColumns;
    const statsRowHeight = isSocialPreview ? socialStatsLayout.rowHeight : 68;
    const statsItemsTop = isSocialPreview ? 34 : 42;
    const swatchWidth = isSocialPreview
      ? Math.max(34, Math.min(64, itemWidth - 10))
      : Math.max(42, Math.min(72, itemWidth - 18));
    const swatchHeight = isSocialPreview
      ? 22
      : Math.max(24, Math.min(36, Math.round(cellSize * 1.25)));

    ctx.strokeStyle = isSocialPreview ? '#E4E0D7' : '#DED9CF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pagePadding, statsTop);
    ctx.lineTo(sheetWidth - pagePadding, statsTop);
    ctx.stroke();

    ctx.fillStyle = '#A55B1E';
    ctx.font = `600 ${isSocialPreview ? 9 : 11}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('颜色统计', pagePadding, statsTop + (isSocialPreview ? 18 : 24));
    ctx.fillStyle = '#7A746B';
    ctx.font = `500 ${isSocialPreview ? 8 : 10}px sans-serif`;
    ctx.fillText(
      `${colorKeys.length} 色 · ${totalBeadCount} 颗`,
      pagePadding + (isSocialPreview ? 48 : 58),
      statsTop + (isSocialPreview ? 18 : 24),
    );

    colorKeys.forEach((key, index) => {
      const row = Math.floor(index / statsColumns);
      const col = index % statsColumns;
      const itemCenterX = pagePadding + col * itemWidth + itemWidth / 2;
      const swatchX = itemCenterX - swatchWidth / 2;
      const swatchY = statsTop + statsItemsTop + row * statsRowHeight;
      const item = colorCounts[key];
      const color = item.color || key;
      const label = item.displayKey ?? getColorKeyByHex(key, selectedColorSystem);

      ctx.fillStyle = color;
      ctx.fillRect(swatchX, swatchY, swatchWidth, swatchHeight);
      ctx.strokeStyle = '#B9B4AB';
      ctx.lineWidth = 0.75;
      ctx.strokeRect(swatchX + 0.5, swatchY + 0.5, swatchWidth - 1, swatchHeight - 1);
      ctx.fillStyle = getContrastColor(color);
      ctx.font = `600 ${isSocialPreview ? 7 : 9}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(label, itemCenterX, swatchY + swatchHeight / 2);
      ctx.fillStyle = '#6F6A62';
      ctx.font = `500 ${isSocialPreview ? 7 : 9}px sans-serif`;
      ctx.fillText(`${item.count} 颗`, itemCenterX, swatchY + swatchHeight + (isSocialPreview ? 9 : 12));
    });

    ctx.fillStyle = '#8A847B';
    ctx.font = `500 ${isSocialPreview ? 7 : 9}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(
      `${selectedColorSystem} · ${N}×${M} · ${colorKeys.length} 色 · ${totalBeadCount} 颗`,
      sheetWidth - pagePadding,
      sheetHeight - 12
    );
  }

  try {
    const blob = await canvasToPngBlob(canvas);
    const imageUrl = URL.createObjectURL(blob);
    const filename = isSocialPreview
      ? `bead-grid-${N}x${M}-social-preview-palette_${selectedColorSystem}.png`
      : showCellNumbers
        ? `bead-grid-${N}x${M}-keys-palette_${selectedColorSystem}.png`
        : `bead-grid-${N}x${M}-pixel-palette_${selectedColorSystem}.png`;

    // The encoded Blob is independent from the Canvas. Releasing the backing
    // store here avoids keeping a high-resolution canvas and a Base64 copy in
    // memory at the same time on mobile devices.
    canvas.width = 1;
    canvas.height = 1;

    return { imageUrl, blob, filename };
  } catch (error) {
    console.error('生成图纸失败:', error);
    alert('无法生成图纸。');
    return null;
  }
}

// 下载图片的主函数
export async function downloadImage(params: DownloadImageParams): Promise<void> {
  let highResolutionResult = await generateDownloadImagePreview(params);
  if (!highResolutionResult) return;
  let socialPreviewResult: DownloadImagePreviewResult | null = null;

  try {
    await saveImageBlob(highResolutionResult.blob, highResolutionResult.filename);
    console.log("Grid image download initiated.");
    releaseDownloadImagePreviewUrl(highResolutionResult.imageUrl);
    highResolutionResult = null;

    if (params.options.includeSocialPreview) {
      socialPreviewResult = await generateDownloadImagePreview(params, 'social-preview');
      if (socialPreviewResult) {
        await saveImageBlob(socialPreviewResult.blob, socialPreviewResult.filename);
        console.log("Social preview download initiated.");
      }
    }

    // 如果启用了CSV导出，同时导出CSV文件
    if (params.options.exportCsv) {
      exportCsvData({
        mappedPixelData: params.mappedPixelData,
        gridDimensions: params.gridDimensions,
        selectedColorSystem: params.selectedColorSystem
      });
    }
  } catch (e) {
    console.error("下载图纸失败:", e);
    alert("无法生成图纸下载链接。");
  } finally {
    releaseDownloadImagePreviewUrl(highResolutionResult?.imageUrl);
    releaseDownloadImagePreviewUrl(socialPreviewResult?.imageUrl);
  }
}
