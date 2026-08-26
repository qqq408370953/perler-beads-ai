import { GridDownloadOptions } from '../types/downloadTypes';
import { MappedPixel, PaletteColor } from './pixelation';
import { getMappedColorDisplayKey, getColorKeyByHex, ColorSystem } from './colorSystemUtils';

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

  const { N, M } = gridDimensions;
  
  // 生成CSV内容，每行代表图纸的一行
  const csvLines: string[] = [];
  
  for (let row = 0; row < M; row++) {
    const rowData: string[] = [];
    for (let col = 0; col < N; col++) {
      const cellData = mappedPixelData[row][col];
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
    console.error("下载失败: 映射数据或尺寸无效。");
    alert("无法生成图纸，数据未生成或无效。");
    return null;
  }
  if (!colorCounts) {
    console.error("下载失败: 色号统计数据无效。");
    alert("无法生成图纸，色号统计数据未生成或无效。");
    return null;
  }
  
  // 主要下载处理函数
  const processDownload = async (): Promise<DownloadImagePreviewResult | null> => {
    const { N, M } = gridDimensions; // 此时已确保gridDimensions不为null
    const downloadCellSize = 30;
  
    // 从下载选项中获取设置
    const { showGrid, gridInterval, showCoordinates, gridLineColor, includeStats, showCellNumbers = true } = options;
  
    // 设置坐标轴空间。坐标轴按格子逐格绘制，轴厚度略大于格子以容纳三位数。
    const axisLabelSize = showCoordinates ? Math.max(downloadCellSize, Math.ceil(downloadCellSize * 1.35), 14) : 0;
    
    // 定义统计区域的基本参数
    const statsPadding = 20;
    let statsHeight = 0;
    
    // 预先计算用于字体大小的变量
    const preCalcWidth = N * downloadCellSize + (axisLabelSize * 2);
    const preCalcAvailableWidth = preCalcWidth - (statsPadding * 2);
    
    // 计算字体大小 - 与颜色统计区域保持一致
    const baseStatsFontSize = 13;
    const widthFactor = Math.max(0, preCalcAvailableWidth - 350) / 600;
    const statsFontSize = Math.floor(baseStatsFontSize + (widthFactor * 10));
    
    // 计算额外边距，确保坐标数字完全显示（四边都需要）
    const extraLeftMargin = showCoordinates ? Math.max(10, statsFontSize) : 0; // 左侧额外边距
    const extraRightMargin = showCoordinates ? Math.max(10, statsFontSize) : 0; // 右侧额外边距
    const extraTopMargin = showCoordinates ? Math.max(8, Math.floor(statsFontSize * 0.8)) : 0; // 顶部额外边距
    const extraBottomMargin = showCoordinates ? Math.max(8, Math.floor(statsFontSize * 0.8)) : 0; // 底部额外边距
    
    // 计算网格尺寸
    const gridWidth = N * downloadCellSize;
    const gridHeight = M * downloadCellSize;
    
    const titleBarHeight = 0;
    
    // 计算统计区域的大小
    if (includeStats && colorCounts) {
      const colorKeys = Object.keys(colorCounts);
      
      // 统计区域顶部额外间距
      const statsTopMargin = 24; // 与下方渲染时保持一致
      
      // 根据可用宽度动态计算列数
      const numColumns = Math.max(1, Math.min(4, Math.floor(preCalcAvailableWidth / 250)));
      
      // 根据可用宽度动态计算样式参数，使用更积极的线性缩放
      const baseSwatchSize = 18; // 略微增大基础大小
      // baseStatsFontSize 和 statsFontSize 在前面已经计算了，这里不需要重复
      // const baseItemPadding = 10;
      
      // 调整缩放公式，使大宽度更明显增大
      // widthFactor 在前面已经计算了，这里不需要重复
      const swatchSize = Math.floor(baseSwatchSize + (widthFactor * 20)); // 增大最大增量幅度
      // statsFontSize 在前面已经计算了，这里不需要重复
      // const itemPadding = Math.floor(baseItemPadding + (widthFactor * 12)); // 增大最大增量幅度 // 移除未使用的 itemPadding
      
      // 计算实际需要的行数
      const numRows = Math.ceil(colorKeys.length / numColumns);
      
      // 计算单行高度 - 根据色块大小和内边距动态调整
      const statsRowHeight = Math.max(swatchSize + 8, 25);
      
      // 标题和页脚高度
      const titleHeight = 40; // 标题和分隔线的总高度
      const footerHeight = 40; // 总计部分的高度
      
      // 计算统计区域的总高度 - 需要包含顶部间距
      statsHeight = titleHeight + (numRows * statsRowHeight) + footerHeight + (statsPadding * 2) + statsTopMargin;
    }
  
    // 调整画布大小，包含坐标轴和统计区域（四边都有坐标）
    const downloadWidth = gridWidth + (axisLabelSize * 2) + extraLeftMargin + extraRightMargin;
    let downloadHeight = titleBarHeight + gridHeight + (axisLabelSize * 2) + statsHeight + extraTopMargin + extraBottomMargin;
  
    let downloadCanvas = document.createElement('canvas');
    downloadCanvas.width = downloadWidth;
    downloadCanvas.height = downloadHeight;
    const context = downloadCanvas.getContext('2d');
    if (!context) {
      console.error("下载失败: 无法创建临时 Canvas Context。");
      alert("无法生成图纸。");
      return null;
    }
    
    // 使用非空的context变量
    let ctx = context;
    ctx.imageSmoothingEnabled = false;
  
    // 设置背景色
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, downloadWidth, downloadHeight);
  
    console.log(`Generating download grid image: ${downloadWidth}x${downloadHeight}, cell size: ${downloadCellSize}`);
    const fontSize = Math.max(8, Math.floor(downloadCellSize * 0.4));
    
    const gridOriginX = extraLeftMargin + axisLabelSize;
    const gridOriginY = titleBarHeight + extraTopMargin + axisLabelSize;
    const topAxisY = titleBarHeight + extraTopMargin;
    const bottomAxisY = gridOriginY + gridHeight;
    const leftAxisX = extraLeftMargin;
    const rightAxisX = gridOriginX + gridWidth;
    const axisFillColor = '#A9473F';
    const axisGridLineColor = '#6F2A26';
    const axisTextColor = '#F8FAFC';
    const baseGridLineColor = '#8A8A8A';
    const majorGridLineColor = gridLineColor === '#555555' ? '#111111' : gridLineColor;
    const backgroundCellColor = '#FAFAFA';
    const baseGridLineWidth = downloadCellSize <= 10 ? 0.9 : 1;
    const majorGridLineWidth = downloadCellSize <= 10 ? 2 : 2.4;

    // 如果需要，先绘制坐标轴和网格背景
    if (showCoordinates) {
      const axisFontSize = Math.max(4, Math.min(10, Math.floor(downloadCellSize * 0.52)));
      ctx.font = `bold ${axisFontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 四角空白轴格
      ctx.fillStyle = axisFillColor;
      ctx.fillRect(leftAxisX, topAxisY, axisLabelSize, axisLabelSize);
      ctx.fillRect(rightAxisX, topAxisY, axisLabelSize, axisLabelSize);
      ctx.fillRect(leftAxisX, bottomAxisY, axisLabelSize, axisLabelSize);
      ctx.fillRect(rightAxisX, bottomAxisY, axisLabelSize, axisLabelSize);
      ctx.strokeStyle = axisGridLineColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(leftAxisX + 0.5, topAxisY + 0.5, axisLabelSize, axisLabelSize);
      ctx.strokeRect(rightAxisX + 0.5, topAxisY + 0.5, axisLabelSize, axisLabelSize);
      ctx.strokeRect(leftAxisX + 0.5, bottomAxisY + 0.5, axisLabelSize, axisLabelSize);
      ctx.strokeRect(rightAxisX + 0.5, bottomAxisY + 0.5, axisLabelSize, axisLabelSize);

      // X轴（顶部/底部）逐格数字
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < N; i++) {
        const axisX = gridOriginX + (i * downloadCellSize);
        const label = (i + 1).toString();

        ctx.fillStyle = axisFillColor;
        ctx.fillRect(axisX, topAxisY, downloadCellSize, axisLabelSize);
        ctx.fillRect(axisX, bottomAxisY, downloadCellSize, axisLabelSize);
        ctx.strokeStyle = axisGridLineColor;
        ctx.strokeRect(axisX + 0.5, topAxisY + 0.5, downloadCellSize, axisLabelSize);
        ctx.strokeRect(axisX + 0.5, bottomAxisY + 0.5, downloadCellSize, axisLabelSize);

        ctx.fillStyle = axisTextColor;
        ctx.fillText(label, axisX + (downloadCellSize / 2), topAxisY + (axisLabelSize / 2));
        ctx.fillText(label, axisX + (downloadCellSize / 2), bottomAxisY + (axisLabelSize / 2));
      }

      // Y轴（左侧/右侧）逐格数字
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let j = 0; j < M; j++) {
        const axisY = gridOriginY + (j * downloadCellSize);
        const label = (j + 1).toString();

        ctx.fillStyle = axisFillColor;
        ctx.fillRect(leftAxisX, axisY, axisLabelSize, downloadCellSize);
        ctx.fillRect(rightAxisX, axisY, axisLabelSize, downloadCellSize);
        ctx.strokeStyle = axisGridLineColor;
        ctx.strokeRect(leftAxisX + 0.5, axisY + 0.5, axisLabelSize, downloadCellSize);
        ctx.strokeRect(rightAxisX + 0.5, axisY + 0.5, axisLabelSize, downloadCellSize);

        ctx.fillStyle = axisTextColor;
        ctx.fillText(label, leftAxisX + (axisLabelSize / 2), axisY + (downloadCellSize / 2));
        ctx.fillText(label, rightAxisX + (axisLabelSize / 2), axisY + (downloadCellSize / 2));
      }
    }
    
    // 恢复默认文本对齐和基线，为后续绘制做准备
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 设置用于绘制单元格内容的字体
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 绘制所有单元格
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < N; i++) {
        const cellData = mappedPixelData[j][i];
        // 计算绘制位置，考虑额外边距和标题栏高度
        const drawX = gridOriginX + i * downloadCellSize;
        const drawY = gridOriginY + j * downloadCellSize;

        // 根据是否是外部背景确定填充颜色
        if (cellData && !cellData.isExternal) {
          // 内部单元格：使用珠子颜色填充并绘制文本
          const cellColor = cellData.color || '#FFFFFF';

          ctx.fillStyle = cellColor;
          ctx.fillRect(drawX, drawY, downloadCellSize, downloadCellSize);

          if (showCellNumbers) {
            const cellKey = getMappedColorDisplayKey(cellData.color || '#FFFFFF', selectedColorSystem, cellData.key);
            ctx.fillStyle = getContrastColor(cellColor);
            ctx.fillText(cellKey, drawX + downloadCellSize / 2, drawY + downloadCellSize / 2);
          }
        } else {
          // 外部背景：同样绘制清晰格子，便于按坐标定位，但不显示色号。
          ctx.fillStyle = backgroundCellColor;
          ctx.fillRect(drawX, drawY, downloadCellSize, downloadCellSize);
        }

        // 绘制所有单元格的边框
        ctx.strokeStyle = baseGridLineColor; // 背景格也保持清晰可见
        ctx.lineWidth = baseGridLineWidth;
        ctx.strokeRect(drawX + 0.5, drawY + 0.5, downloadCellSize, downloadCellSize);
      }
    }

    // 如果需要，绘制分隔网格线
    if (showGrid) {
      ctx.strokeStyle = majorGridLineColor; // 默认参考图纸使用黑色粗分隔线
      ctx.lineWidth = majorGridLineWidth;
      
      // 绘制垂直分隔线 - 在单元格之间而不是边框上
      for (let i = gridInterval; i < N; i += gridInterval) {
        const lineX = gridOriginX + i * downloadCellSize;
        ctx.beginPath();
        ctx.moveTo(lineX, topAxisY);
        ctx.lineTo(lineX, bottomAxisY + axisLabelSize);
        ctx.stroke();
      }
      
      // 绘制水平分隔线 - 在单元格之间而不是边框上
      for (let j = gridInterval; j < M; j += gridInterval) {
        const lineY = gridOriginY + j * downloadCellSize;
        ctx.beginPath();
        ctx.moveTo(leftAxisX, lineY);
        ctx.lineTo(rightAxisX + axisLabelSize, lineY);
        ctx.stroke();
      }
    }

    // 绘制整个网格区域的主边框
    ctx.strokeStyle = '#111111'; // 黑色边框
    ctx.lineWidth = majorGridLineWidth;
    ctx.strokeRect(
      gridOriginX + 0.5,
      gridOriginY + 0.5,
      N * downloadCellSize, 
      M * downloadCellSize
    );

    // 绘制统计信息
    if (includeStats && colorCounts) {
      const colorKeys = Object.keys(colorCounts).sort(sortColorKeys);
      
      // 增加额外的间距，防止标题文字侵入画布
      const statsTopMargin = 24; // 增加间距，防止文字侵入画布
      const statsY = bottomAxisY + axisLabelSize + statsPadding + statsTopMargin;
      
      // 计算统计区域的可用宽度
      const availableStatsWidth = downloadWidth - (statsPadding * 2);
      
      // 根据可用宽度动态计算列数 - 这里使用实际渲染时的宽度
      const renderNumColumns = Math.max(1, Math.min(4, Math.floor(availableStatsWidth / 250)));
      
      // 根据可用宽度动态计算样式参数，使用更积极的线性缩放
      const baseSwatchSize = 18; // 略微增大基础大小
      // baseStatsFontSize 和 statsFontSize 在前面已经计算了，这里不需要重复
      // const baseItemPadding = 10;
      
      // 调整缩放公式，使大宽度更明显增大
      // widthFactor 在前面已经计算了，这里不需要重复
      const swatchSize = Math.floor(baseSwatchSize + (widthFactor * 20)); // 增大最大增量幅度
      // statsFontSize 在前面已经计算了，这里不需要重复
      // const itemPadding = Math.floor(baseItemPadding + (widthFactor * 12)); // 增大最大增量幅度 // 移除未使用的 itemPadding
      
      // 计算每个项目所占的宽度
      const itemWidth = Math.floor(availableStatsWidth / renderNumColumns);
      
      // 绘制统计区域标题
      ctx.fillStyle = '#333333';
      ctx.font = `bold ${Math.max(16, statsFontSize)}px sans-serif`;
      ctx.textAlign = 'left';
      
      // 绘制分隔线
      ctx.strokeStyle = '#DDDDDD';
      ctx.beginPath();
      ctx.moveTo(statsPadding, statsY + 20);
      ctx.lineTo(downloadWidth - statsPadding, statsY + 20);
      ctx.stroke();
      
      const titleHeight = 30; // 标题和分隔线的总高度
      // 根据色块大小动态调整行高
      const statsRowHeight = Math.max(swatchSize + 8, 25); // 确保行高足够放下色块和文字
      
      // 设置表格字体
      ctx.font = `${statsFontSize}px sans-serif`;
      
      // 绘制每行统计信息
      colorKeys.forEach((key, index) => {
        // 计算当前项目应该在哪一行和哪一列
        const rowIndex = Math.floor(index / renderNumColumns);
        const colIndex = index % renderNumColumns;
        
        // 计算当前项目的X起始位置
        const itemX = statsPadding + (colIndex * itemWidth);
        
        // 计算当前行的Y位置
        const rowY = statsY + titleHeight + (rowIndex * statsRowHeight) + (swatchSize / 2);
        
        const cellData = colorCounts[key];
        
        // 绘制色块
        ctx.fillStyle = cellData.color;
        ctx.strokeStyle = '#CCCCCC';
        ctx.fillRect(itemX, rowY - (swatchSize / 2), swatchSize, swatchSize);
        ctx.strokeRect(itemX + 0.5, rowY - (swatchSize / 2) + 0.5, swatchSize - 1, swatchSize - 1);
        
        // 绘制色号
        ctx.fillStyle = '#333333';
        ctx.textAlign = 'left';
        ctx.fillText(cellData.displayKey ?? getColorKeyByHex(key, selectedColorSystem), itemX + swatchSize + 5, rowY);
        
        // 绘制数量 - 在每个项目的右侧
        const countText = `${cellData.count} 颗`;
        ctx.textAlign = 'right';
        
        // 根据列数计算数字的位置
        // 如果只有一列，就靠右绘制
        if (renderNumColumns === 1) {
          ctx.fillText(countText, downloadWidth - statsPadding, rowY);
        } else {
          // 多列时，在每个单元格右侧偏内绘制
          ctx.fillText(countText, itemX + itemWidth - 10, rowY);
        }
      });
      
      // 计算实际需要的行数
      const numRows = Math.ceil(colorKeys.length / renderNumColumns);
      
      // 绘制总量
      const totalY = statsY + titleHeight + (numRows * statsRowHeight) + 10;
      ctx.font = `bold ${statsFontSize}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(`总计: ${totalBeadCount} 颗`, downloadWidth - statsPadding, totalY);
      
      // 更新统计区域高度的计算 - 需要包含新增的顶部间距
      const footerHeight = 30; // 总计部分高度
      statsHeight = titleHeight + (numRows * statsRowHeight) + footerHeight + (statsPadding * 2) + statsTopMargin;
    }

    // 重新计算画布高度并调整
    if (includeStats && colorCounts) {
      // 调整画布大小，包含计算后的统计区域
      const newDownloadHeight = titleBarHeight + extraTopMargin + M * downloadCellSize + (axisLabelSize * 2) + statsHeight + extraBottomMargin;
      
      if (downloadHeight !== newDownloadHeight) {
        // 如果高度变化了，需要创建新的画布并复制当前内容
        const newCanvas = document.createElement('canvas');
        newCanvas.width = downloadWidth;
        newCanvas.height = newDownloadHeight;
        const newContext = newCanvas.getContext('2d');
        
        if (newContext) {
          // 先填充背景，避免扩展出的画布区域在部分查看器中显示为透明。
          newContext.fillStyle = '#FFFFFF';
          newContext.fillRect(0, 0, newCanvas.width, newCanvas.height);
          // 复制原画布内容
          newContext.drawImage(downloadCanvas, 0, 0);
          
          // 更新画布和上下文引用
          downloadCanvas = newCanvas;
          ctx = newContext;
          ctx.imageSmoothingEnabled = false;
          
          // 更新高度
          downloadHeight = newDownloadHeight;
        }
      }
    }

    try {
      const blob = await canvasToPngBlob(downloadCanvas);
      const dataURL = downloadCanvas.toDataURL('image/png');
      const filename = showCellNumbers
        ? `bead-grid-${N}x${M}-keys-palette_${selectedColorSystem}.png`
        : `bead-grid-${N}x${M}-pixel-palette_${selectedColorSystem}.png`;
      return { imageUrl: dataURL, dataURL, blob, filename };
    } catch (e) {
      console.error("生成图纸失败:", e);
      alert("无法生成图纸。");
      return null;
    }
  };
  return processDownload();
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
