import { GridDownloadOptions } from '../types/downloadTypes';
import { MappedPixel, PaletteColor } from './pixelation';
import { getMappedColorDisplayKey, getColorKeyByHex, ColorSystem } from './colorSystemUtils';
import { cropPixelDataToContent, TRANSPARENT_KEY } from './pixelEditingUtils';

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
  dataURL: string;
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
  const largestSide = Math.max(N, M);
  if (largestSide <= 64) return 28;
  if (largestSide <= 110) return 20;
  if (largestSide <= 180) return 14;
  return 10;
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
}: DownloadImageParams): Promise<DownloadImagePreviewResult | null> {
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
  const cellSize = getDownloadCellSize(N, M);
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
  const statsGap = includeStats && colorKeys.length > 0 ? 28 : 0;
  const statsColumns = Math.max(1, Math.min(10, Math.floor((sheetWidth - pagePadding * 2) / 120)));
  const statsRows = Math.ceil(colorKeys.length / statsColumns);
  const statsHeight = includeStats && colorKeys.length > 0 ? 54 + statsRows * 68 + 34 : 0;
  const sheetHeight = pagePadding * 2 + headerHeight + coordinateBand * 2 + gridHeight + statsGap + statsHeight;
  const canvas = document.createElement('canvas');
  canvas.width = sheetWidth;
  canvas.height = sheetHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    alert('无法生成图纸。');
    return null;
  }

  const sheetColor = '#FFFEF8';
  const emptyCellColor = '#FFFCEE';
  const minorLineColor = '#8D8980';
  const outerLineColor = '#55524C';
  const majorLineColor = gridLineColor || outerLineColor;
  const originX = pagePadding + coordinateBand;
  const originY = pagePadding + headerHeight + coordinateBand;
  const gridBottom = originY + gridHeight;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = sheetColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const headerTitle = `拼豆图纸生成器 / ${selectedColorSystem}`;
  const headerMeta = `${N}×${M} · ${colorKeys.length} 色 · ${totalBeadCount} 颗`;
  const headerFontSize = Math.max(9, Math.min(15, Math.floor(sheetWidth / 72)));
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
    const axisFontSize = Math.max(6, Math.min(10, Math.floor(cellSize * 0.34)));
    ctx.fillStyle = '#5F5B54';
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

  const cellFontSize = Math.max(5, Math.min(10, Math.floor(cellSize * 0.34)));
  ctx.font = `500 ${cellFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let row = 0; row < M; row++) {
    for (let col = 0; col < N; col++) {
      const cell = mappedPixelData[row]?.[col];
      const drawX = originX + col * cellSize;
      const drawY = originY + row * cellSize;
      const isEmpty = !cell || cell.isExternal || cell.key === TRANSPARENT_KEY;
      const cellColor = isEmpty ? emptyCellColor : cell.color || '#FFFFFF';

      ctx.fillStyle = cellColor;
      ctx.fillRect(drawX, drawY, cellSize, cellSize);

      if (!isEmpty && showCellNumbers) {
        ctx.fillStyle = getContrastColor(cellColor);
        ctx.fillText(
          getMappedColorDisplayKey(cellColor, selectedColorSystem, cell!.key),
          drawX + cellSize / 2,
          drawY + cellSize / 2
        );
      }
    }
  }

  ctx.strokeStyle = minorLineColor;
  ctx.lineWidth = cellSize <= 14 ? 0.55 : 0.75;
  ctx.beginPath();
  for (let col = 1; col < N; col++) {
    const lineX = originX + col * cellSize;
    ctx.moveTo(lineX, originY);
    ctx.lineTo(lineX, gridBottom);
  }
  for (let row = 1; row < M; row++) {
    const lineY = originY + row * cellSize;
    ctx.moveTo(originX, lineY);
    ctx.lineTo(originX + gridWidth, lineY);
  }
  ctx.stroke();

  if (showGrid) {
    ctx.strokeStyle = majorLineColor;
    ctx.lineWidth = cellSize <= 14 ? 1.1 : 1.5;
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

  ctx.strokeStyle = outerLineColor;
  ctx.lineWidth = cellSize <= 14 ? 1.2 : 1.8;
  ctx.strokeRect(originX + 0.5, originY + 0.5, gridWidth, gridHeight);

  if (includeStats && colorKeys.length > 0) {
    const statsTop = gridBottom + coordinateBand + statsGap;
    const availableWidth = sheetWidth - pagePadding * 2;
    const itemWidth = availableWidth / statsColumns;
    const swatchWidth = Math.max(42, Math.min(72, itemWidth - 18));
    const swatchHeight = Math.max(24, Math.min(36, Math.round(cellSize * 1.25)));

    ctx.strokeStyle = '#DED9CF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pagePadding, statsTop);
    ctx.lineTo(sheetWidth - pagePadding, statsTop);
    ctx.stroke();

    ctx.fillStyle = '#A55B1E';
    ctx.font = '600 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('颜色统计', pagePadding, statsTop + 24);
    ctx.fillStyle = '#7A746B';
    ctx.font = '500 10px sans-serif';
    ctx.fillText(`${colorKeys.length} 色 · ${totalBeadCount} 颗`, pagePadding + 58, statsTop + 24);

    colorKeys.forEach((key, index) => {
      const row = Math.floor(index / statsColumns);
      const col = index % statsColumns;
      const itemCenterX = pagePadding + col * itemWidth + itemWidth / 2;
      const swatchX = itemCenterX - swatchWidth / 2;
      const swatchY = statsTop + 42 + row * 68;
      const item = colorCounts[key];
      const color = item.color || key;
      const label = item.displayKey ?? getColorKeyByHex(key, selectedColorSystem);

      ctx.fillStyle = color;
      ctx.fillRect(swatchX, swatchY, swatchWidth, swatchHeight);
      ctx.strokeStyle = '#B9B4AB';
      ctx.lineWidth = 0.75;
      ctx.strokeRect(swatchX + 0.5, swatchY + 0.5, swatchWidth - 1, swatchHeight - 1);
      ctx.fillStyle = getContrastColor(color);
      ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, itemCenterX, swatchY + swatchHeight / 2);
      ctx.fillStyle = '#6F6A62';
      ctx.font = '500 9px sans-serif';
      ctx.fillText(`${item.count} 颗`, itemCenterX, swatchY + swatchHeight + 12);
    });

    ctx.fillStyle = '#8A847B';
    ctx.font = '500 9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(
      `${selectedColorSystem} · ${N}×${M} · ${colorKeys.length} 色 · ${totalBeadCount} 颗`,
      sheetWidth - pagePadding,
      sheetHeight - 12
    );
  }

  try {
    const blob = await canvasToPngBlob(canvas);
    const dataURL = canvas.toDataURL('image/png');
    const filename = showCellNumbers
      ? `bead-grid-${N}x${M}-keys-palette_${selectedColorSystem}.png`
      : `bead-grid-${N}x${M}-pixel-palette_${selectedColorSystem}.png`;
    return { imageUrl: dataURL, dataURL, blob, filename };
  } catch (error) {
    console.error('生成图纸失败:', error);
    alert('无法生成图纸。');
    return null;
  }
}

// 下载图片的主函数
export async function downloadImage(params: DownloadImageParams): Promise<void> {
  const result = await generateDownloadImagePreview(params);
  if (!result) return;

  try {
    triggerDataUrlDownload(result.dataURL, result.filename);
    releaseDownloadImagePreviewUrl(result.imageUrl);
    console.log("Grid image download initiated.");

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
  }
} 
