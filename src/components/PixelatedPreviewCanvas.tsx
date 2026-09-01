'use client';

import React, { useRef, useEffect, TouchEvent, MouseEvent, PointerEvent, useMemo, useState } from 'react';
import { MappedPixel } from '../utils/pixelation';
import { TRANSPARENT_KEY } from '../utils/pixelEditingUtils';
import { GridDownloadOptions } from '../types/downloadTypes';
import { ColorSystem, getDisplayColorKey, getMappedColorDisplayKey } from '../utils/colorSystemUtils';

export type RegionSelectionMode = 'none' | 'rectangle' | 'lasso';

export interface RegionSelectionCell {
  row: number;
  col: number;
}

interface CanvasPoint {
  x: number;
  y: number;
}

interface PixelatedPreviewCanvasProps {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  isManualColoringMode: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onInteraction: (
    clientX: number,
    clientY: number,
    pageX: number,
    pageY: number,
    isClick: boolean,
    isTouchEnd?: boolean
  ) => void;
  highlightColorKey?: string | null;
  onHighlightComplete?: () => void;
  selectionMode?: RegionSelectionMode;
  selectedRegionCells?: RegionSelectionCell[];
  onRegionSelectionComplete?: (cells: RegionSelectionCell[]) => void;
  displayScale?: number;
  renderMode?: 'editor' | 'pattern';
  downloadOptions?: GridDownloadOptions;
  colorCounts?: { [key: string]: { count: number; color: string; displayKey?: string } } | null;
  totalBeadCount?: number;
  selectedColorSystem?: ColorSystem;
  showReferenceGrid?: boolean;
}

interface GridMetrics {
  originX: number;
  originY: number;
  cellWidth: number;
  cellHeight: number;
  gridWidth: number;
  gridHeight: number;
}

interface PatternCanvasLayout extends GridMetrics {
  width: number;
  height: number;
  headerHeight: number;
  headerY: number;
  axisLabelSize: number;
  topAxisY: number;
  bottomAxisY: number;
  leftAxisX: number;
  rightAxisX: number;
  statsY: number;
  statsHeight: number;
}

const isSelectableCell = (cell: MappedPixel | undefined) => {
  return Boolean(cell && !cell.isExternal && cell.key && cell.key !== TRANSPARENT_KEY);
};

const getCanvasPoint = (
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): CanvasPoint => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: Math.max(0, Math.min(canvas.width, (clientX - rect.left) * scaleX)),
    y: Math.max(0, Math.min(canvas.height, (clientY - rect.top) * scaleY)),
  };
};

const getGridMetrics = (canvas: HTMLCanvasElement, dims: { N: number; M: number }): GridMetrics => {
  const originX = Number(canvas.dataset.gridOriginX ?? 0);
  const originY = Number(canvas.dataset.gridOriginY ?? 0);
  const cellWidth = Number(canvas.dataset.gridCellWidth ?? canvas.width / dims.N);
  const cellHeight = Number(canvas.dataset.gridCellHeight ?? canvas.height / dims.M);

  return {
    originX,
    originY,
    cellWidth,
    cellHeight,
    gridWidth: cellWidth * dims.N,
    gridHeight: cellHeight * dims.M,
  };
};

const setCanvasGridMetrics = (canvas: HTMLCanvasElement, metrics: GridMetrics) => {
  canvas.dataset.gridOriginX = String(metrics.originX);
  canvas.dataset.gridOriginY = String(metrics.originY);
  canvas.dataset.gridCellWidth = String(metrics.cellWidth);
  canvas.dataset.gridCellHeight = String(metrics.cellHeight);
};

const getCellFromPoint = (
  point: CanvasPoint,
  canvas: HTMLCanvasElement,
  dims: { N: number; M: number }
) => {
  const metrics = getGridMetrics(canvas, dims);
  const relativeX = point.x - metrics.originX;
  const relativeY = point.y - metrics.originY;

  if (
    relativeX < 0 ||
    relativeY < 0 ||
    relativeX >= metrics.gridWidth ||
    relativeY >= metrics.gridHeight
  ) {
    return null;
  }

  return {
    col: Math.min(dims.N - 1, Math.max(0, Math.floor(relativeX / metrics.cellWidth))),
    row: Math.min(dims.M - 1, Math.max(0, Math.floor(relativeY / metrics.cellHeight))),
  };
};

const getResponsiveCanvasSize = (dims: { N: number; M: number }) => {
  const baseWidth = 500;
  const minCellSize = 4;
  const recommendedCellSize = 6;
  let outputWidth = baseWidth;

  if (dims.N > 100) {
    const requiredWidthForMinSize = dims.N * minCellSize;
    const requiredWidthForRecommendedSize = dims.N * recommendedCellSize;
    const maxWidth = typeof window !== 'undefined'
      ? Math.min(1200, window.innerWidth * 0.9)
      : 1200;

    outputWidth = Math.min(maxWidth, Math.max(baseWidth, requiredWidthForRecommendedSize));
    outputWidth = Math.max(outputWidth, requiredWidthForMinSize);
  }

  return {
    width: Math.round(outputWidth),
    height: Math.max(1, Math.round(outputWidth * (dims.M / dims.N))),
  };
};

const getContrastColor = (hex: string): string => {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.5 ? '#111111' : '#FFFFFF';
};

const sortColorKeys = (a: string, b: string): number => {
  const regex = /^([A-Z]+)(\d+)$/;
  const matchA = a.match(regex);
  const matchB = b.match(regex);

  if (matchA && matchB) {
    if (matchA[1] !== matchB[1]) return matchA[1].localeCompare(matchB[1]);
    return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
  }

  return a.localeCompare(b);
};

const getPatternCellSize = (N: number, M: number): number => {
  const largestSide = Math.max(N, M);
  if (largestSide <= 0) return 28;
  if (largestSide <= 64) return 28;
  if (largestSide <= 110) return 20;
  if (largestSide <= 180) return 14;
  return 10;
};

const getPatternCanvasLayout = (
  dims: { N: number; M: number },
  options?: GridDownloadOptions,
  colorCounts?: { [key: string]: { count: number; color: string; displayKey?: string } } | null
): PatternCanvasLayout => {
  const { N, M } = dims;
  const showCoordinates = options?.showCoordinates ?? true;
  const includeStats = options?.includeStats ?? true;
  const cellSize = getPatternCellSize(N, M);
  const axisLabelSize = showCoordinates ? Math.max(14, Math.ceil(cellSize * 0.72)) : 0;
  const headerHeight = Math.max(34, Math.min(46, Math.round(cellSize * 1.7)));
  const statsPadding = 20;
  const gridWidth = N * cellSize;
  const gridHeight = M * cellSize;
  const preCalcWidth = gridWidth + axisLabelSize * 2;
  const availableWidth = preCalcWidth - statsPadding * 2;
  const extraLeftMargin = showCoordinates ? 8 : 0;
  const extraRightMargin = showCoordinates ? 8 : 0;
  const extraTopMargin = showCoordinates ? 8 : 0;
  const extraBottomMargin = showCoordinates ? 8 : 0;
  let statsHeight = 0;

  if (includeStats && colorCounts && Object.keys(colorCounts).length > 0) {
    const numColumns = Math.max(1, Math.min(10, Math.floor(availableWidth / 120)));
    const numRows = Math.ceil(Object.keys(colorCounts).length / numColumns);
    statsHeight = 54 + numRows * 68 + 34;
  }

  const width = gridWidth + axisLabelSize * 2 + extraLeftMargin + extraRightMargin;
  const originX = extraLeftMargin + axisLabelSize;
  const headerY = extraTopMargin;
  const topAxisY = headerY + headerHeight;
  const originY = topAxisY + axisLabelSize;
  const bottomAxisY = originY + gridHeight;
  const leftAxisX = extraLeftMargin;
  const rightAxisX = originX + gridWidth;
  const statsY = bottomAxisY + axisLabelSize + 24;

  return {
    width,
    height: originY + gridHeight + axisLabelSize + statsHeight + extraBottomMargin,
    originX,
    originY,
    cellWidth: cellSize,
    cellHeight: cellSize,
    gridWidth,
    gridHeight,
    headerHeight,
    headerY,
    axisLabelSize,
    topAxisY,
    bottomAxisY,
    leftAxisX,
    rightAxisX,
    statsY,
    statsHeight,
  };
};

const getCellsInRectangle = (
  start: CanvasPoint,
  current: CanvasPoint,
  canvas: HTMLCanvasElement,
  dims: { N: number; M: number },
  data: MappedPixel[][]
): RegionSelectionCell[] => {
  const metrics = getGridMetrics(canvas, dims);
  const minX = Math.min(start.x, current.x);
  const maxX = Math.max(start.x, current.x);
  const minY = Math.min(start.y, current.y);
  const maxY = Math.max(start.y, current.y);
  const selectionMinX = Math.max(metrics.originX, minX);
  const selectionMaxX = Math.min(metrics.originX + metrics.gridWidth, maxX);
  const selectionMinY = Math.max(metrics.originY, minY);
  const selectionMaxY = Math.min(metrics.originY + metrics.gridHeight, maxY);

  if (selectionMaxX <= selectionMinX || selectionMaxY <= selectionMinY) return [];

  const startCol = Math.max(0, Math.floor((selectionMinX - metrics.originX) / metrics.cellWidth));
  const endCol = Math.min(dims.N - 1, Math.floor(Math.max(0, selectionMaxX - metrics.originX - 0.01) / metrics.cellWidth));
  const startRow = Math.max(0, Math.floor((selectionMinY - metrics.originY) / metrics.cellHeight));
  const endRow = Math.min(dims.M - 1, Math.floor(Math.max(0, selectionMaxY - metrics.originY - 0.01) / metrics.cellHeight));
  const cells: RegionSelectionCell[] = [];

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      if (isSelectableCell(data[row]?.[col])) {
        cells.push({ row, col });
      }
    }
  }

  return cells;
};

const isPointInPolygon = (point: CanvasPoint, polygon: CanvasPoint[]) => {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1) + xi);

    if (intersects) inside = !inside;
  }

  return inside;
};

const getCellsInLasso = (
  points: CanvasPoint[],
  canvas: HTMLCanvasElement,
  dims: { N: number; M: number },
  data: MappedPixel[][]
): RegionSelectionCell[] => {
  if (points.length < 3) {
    const point = points[0];
    if (!point) return [];

    const cell = getCellFromPoint(point, canvas, dims);
    if (!cell) return [];
    const { row, col } = cell;
    return isSelectableCell(data[row]?.[col]) ? [{ row, col }] : [];
  }

  const metrics = getGridMetrics(canvas, dims);
  const minX = Math.max(metrics.originX, Math.min(...points.map(point => point.x)));
  const maxX = Math.min(metrics.originX + metrics.gridWidth, Math.max(...points.map(point => point.x)));
  const minY = Math.max(metrics.originY, Math.min(...points.map(point => point.y)));
  const maxY = Math.min(metrics.originY + metrics.gridHeight, Math.max(...points.map(point => point.y)));
  if (maxX <= minX || maxY <= minY) return [];

  const startCol = Math.max(0, Math.floor((minX - metrics.originX) / metrics.cellWidth));
  const endCol = Math.min(dims.N - 1, Math.floor(Math.max(0, maxX - metrics.originX - 0.01) / metrics.cellWidth));
  const startRow = Math.max(0, Math.floor((minY - metrics.originY) / metrics.cellHeight));
  const endRow = Math.min(dims.M - 1, Math.floor(Math.max(0, maxY - metrics.originY - 0.01) / metrics.cellHeight));
  const cells: RegionSelectionCell[] = [];

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      if (!isSelectableCell(data[row]?.[col])) continue;

      const center = {
        x: metrics.originX + col * metrics.cellWidth + metrics.cellWidth / 2,
        y: metrics.originY + row * metrics.cellHeight + metrics.cellHeight / 2,
      };

      if (isPointInPolygon(center, points)) {
        cells.push({ row, col });
      }
    }
  }

  return cells;
};

// 绘制像素化画布的函数
const drawPixelatedCanvas = (
  dataToDraw: MappedPixel[][],
  canvas: HTMLCanvasElement | null,
  dims: { N: number; M: number } | null,
  highlightColorKey?: string | null,
  isHighlighting?: boolean,
  selectedCells: RegionSelectionCell[] = [],
  previewCells: RegionSelectionCell[] = [],
  selectionPath: CanvasPoint[] = [],
  rectangleBounds?: { start: CanvasPoint; current: CanvasPoint } | null,
  selectedColorSystem: ColorSystem = '通用221色',
  showReferenceGrid = true
) => {
  if (!canvas || !dims || !dataToDraw) {
    console.warn("drawPixelatedCanvas: Missing required parameters");
    return;
  }
  
  const pixelatedCtx = canvas.getContext('2d');
  if (!pixelatedCtx) {
    console.error("Failed to get 2D context for pixelated canvas");
    return;
  }

  const { N, M } = dims;
  const outputWidth = canvas.width;
  const outputHeight = canvas.height;
  const cellWidthOutput = outputWidth / N;
  const cellHeightOutput = outputHeight / M;
  const minimumCellSize = Math.min(cellWidthOutput, cellHeightOutput);
  const showCellLabels = minimumCellSize >= 13;
  const paperColor = '#FFFEFA';
  const minorGridLineColor = 'rgba(145, 154, 153, 0.42)';
  const majorGridLineColor = 'rgba(199, 126, 73, 0.72)';

  pixelatedCtx.imageSmoothingEnabled = false;
  pixelatedCtx.clearRect(0, 0, outputWidth, outputHeight);
  pixelatedCtx.fillStyle = paperColor;
  pixelatedCtx.fillRect(0, 0, outputWidth, outputHeight);

  if (showCellLabels) {
    const fontSize = Math.max(5, Math.min(8, Math.floor(minimumCellSize * 0.4)));
    pixelatedCtx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    pixelatedCtx.textAlign = 'center';
    pixelatedCtx.textBaseline = 'middle';
  }

  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const cellData = dataToDraw[j]?.[i];

      const drawX = i * cellWidthOutput;
      const drawY = j * cellHeightOutput;

      const isTransparent = !cellData || cellData.isExternal || cellData.key === TRANSPARENT_KEY;
      pixelatedCtx.fillStyle = isTransparent ? paperColor : cellData.color;
      pixelatedCtx.fillRect(drawX, drawY, cellWidthOutput, cellHeightOutput);

      if (showCellLabels && cellData && !isTransparent) {
        pixelatedCtx.fillStyle = getContrastColor(cellData.color);
        pixelatedCtx.fillText(
          getMappedColorDisplayKey(cellData.color, selectedColorSystem, cellData.key),
          drawX + cellWidthOutput / 2,
          drawY + cellHeightOutput / 2
        );
      }

      // 如果正在高亮且当前单元格不是目标颜色，添加半透明黑色蒙版
      if (isHighlighting && highlightColorKey) {
        let shouldDim = false;
        
        if (isTransparent) {
          // 外部单元格总是变深色（因为它们不是要高亮的颜色）
          shouldDim = true;
        } else {
          // 内部单元格：如果颜色不匹配则变深色
          shouldDim = cellData!.color.toUpperCase() !== highlightColorKey.toUpperCase();
        }
        
        if (shouldDim) {
          pixelatedCtx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // 60% 透明度的黑色蒙版
          pixelatedCtx.fillRect(drawX, drawY, cellWidthOutput, cellHeightOutput);
        }
      }

    }
  }

  if (showReferenceGrid) {
    pixelatedCtx.save();
    pixelatedCtx.strokeStyle = minorGridLineColor;
    pixelatedCtx.lineWidth = minimumCellSize <= 5 ? 0.45 : 0.65;
    pixelatedCtx.beginPath();
    for (let col = 1; col < N; col++) {
      const lineX = col * cellWidthOutput;
      pixelatedCtx.moveTo(lineX, 0);
      pixelatedCtx.lineTo(lineX, outputHeight);
    }
    for (let row = 1; row < M; row++) {
      const lineY = row * cellHeightOutput;
      pixelatedCtx.moveTo(0, lineY);
      pixelatedCtx.lineTo(outputWidth, lineY);
    }
    pixelatedCtx.stroke();

    pixelatedCtx.strokeStyle = majorGridLineColor;
    pixelatedCtx.lineWidth = minimumCellSize <= 5 ? 1 : 1.35;
    pixelatedCtx.beginPath();
    for (let col = 10; col < N; col += 10) {
      const lineX = col * cellWidthOutput;
      pixelatedCtx.moveTo(lineX, 0);
      pixelatedCtx.lineTo(lineX, outputHeight);
    }
    for (let row = 10; row < M; row += 10) {
      const lineY = row * cellHeightOutput;
      pixelatedCtx.moveTo(0, lineY);
      pixelatedCtx.lineTo(outputWidth, lineY);
    }
    pixelatedCtx.stroke();
    pixelatedCtx.restore();
  }

  pixelatedCtx.strokeStyle = '#B8B7B0';
  pixelatedCtx.lineWidth = 1;
  pixelatedCtx.strokeRect(0.5, 0.5, outputWidth - 1, outputHeight - 1);

  const selectedCellKeys = new Set([
    ...selectedCells.map(cell => `${cell.row}:${cell.col}`),
    ...previewCells.map(cell => `${cell.row}:${cell.col}`),
  ]);

  if (selectedCellKeys.size > 0) {
    pixelatedCtx.save();
    pixelatedCtx.fillStyle = 'rgba(239, 68, 68, 0.34)';
    pixelatedCtx.strokeStyle = 'rgba(185, 28, 28, 0.9)';
    pixelatedCtx.lineWidth = Math.max(1, Math.min(cellWidthOutput, cellHeightOutput) * 0.08);

    selectedCellKeys.forEach(key => {
      const [rowText, colText] = key.split(':');
      const row = Number(rowText);
      const col = Number(colText);
      const drawX = col * cellWidthOutput;
      const drawY = row * cellHeightOutput;
      pixelatedCtx.fillRect(drawX, drawY, cellWidthOutput, cellHeightOutput);
      pixelatedCtx.strokeRect(drawX + 0.5, drawY + 0.5, cellWidthOutput - 1, cellHeightOutput - 1);
    });

    pixelatedCtx.restore();
  }

  if (rectangleBounds) {
    const minX = Math.min(rectangleBounds.start.x, rectangleBounds.current.x);
    const minY = Math.min(rectangleBounds.start.y, rectangleBounds.current.y);
    const width = Math.abs(rectangleBounds.current.x - rectangleBounds.start.x);
    const height = Math.abs(rectangleBounds.current.y - rectangleBounds.start.y);

    pixelatedCtx.save();
    pixelatedCtx.setLineDash([8, 5]);
    pixelatedCtx.strokeStyle = 'rgba(37, 99, 235, 0.95)';
    pixelatedCtx.lineWidth = 2;
    pixelatedCtx.strokeRect(minX, minY, width, height);
    pixelatedCtx.restore();
  }

  if (selectionPath.length > 1) {
    pixelatedCtx.save();
    pixelatedCtx.setLineDash([8, 5]);
    pixelatedCtx.strokeStyle = 'rgba(37, 99, 235, 0.95)';
    pixelatedCtx.lineWidth = 2;
    pixelatedCtx.beginPath();
    pixelatedCtx.moveTo(selectionPath[0].x, selectionPath[0].y);
    selectionPath.slice(1).forEach(point => pixelatedCtx.lineTo(point.x, point.y));
    pixelatedCtx.stroke();
    pixelatedCtx.restore();
  }
};

const drawPatternCanvas = (
  dataToDraw: MappedPixel[][],
  canvas: HTMLCanvasElement,
  dims: { N: number; M: number },
  layout: PatternCanvasLayout,
  options: GridDownloadOptions | undefined,
  colorCounts: { [key: string]: { count: number; color: string; displayKey?: string } } | null | undefined,
  totalBeadCount: number | undefined,
  selectedColorSystem: ColorSystem,
  selectedCells: RegionSelectionCell[] = [],
  previewCells: RegionSelectionCell[] = [],
  selectionPath: CanvasPoint[] = [],
  rectangleBounds?: { start: CanvasPoint; current: CanvasPoint } | null
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { N, M } = dims;
  const showGrid = options?.showGrid ?? true;
  const gridInterval = Math.max(1, options?.gridInterval ?? 10);
  const showCoordinates = options?.showCoordinates ?? true;
  const showCellNumbers = options?.showCellNumbers ?? true;
  const includeStats = options?.includeStats ?? true;
  const majorGridLineColor = options?.gridLineColor ?? '#4F4D48';
  const cellSize = layout.cellWidth;
  const axisTextColor = '#5F5B54';
  const baseGridLineColor = '#8D8980';
  const backgroundCellColor = '#FFFCEE';
  const sheetColor = '#FFFEF8';
  const baseGridLineWidth = cellSize <= 14 ? 0.55 : 0.75;
  const majorGridLineWidth = cellSize <= 14 ? 1.1 : 1.5;

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = sheetColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const headerTitle = `拼豆图纸生成器 / ${selectedColorSystem}`;
  const headerMeta = `${N}×${M} · ${colorCounts ? Object.keys(colorCounts).length : 0} 色 · ${totalBeadCount ?? 0} 颗`;
  const headerPadding = 12;
  const headerFontSize = Math.max(9, Math.min(15, Math.floor(layout.width / 72)));
  ctx.fillStyle = '#4B4741';
  ctx.font = `700 ${headerFontSize}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(headerTitle, headerPadding, layout.headerY + layout.headerHeight / 2);
  const headerTitleWidth = ctx.measureText(headerTitle).width;

  ctx.font = `500 ${Math.max(8, headerFontSize - 2)}px sans-serif`;
  const remainingHeaderWidth = layout.width - headerPadding * 2 - headerTitleWidth - 20;
  if (ctx.measureText(headerMeta).width <= remainingHeaderWidth) {
    ctx.fillStyle = '#777168';
    ctx.textAlign = 'right';
    ctx.fillText(headerMeta, layout.width - headerPadding, layout.headerY + layout.headerHeight / 2);
  }

  if (showCoordinates) {
    const axisFontSize = Math.max(6, Math.min(10, Math.floor(cellSize * 0.34)));
    ctx.font = `500 ${axisFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let col = 0; col < N; col++) {
      const axisX = layout.originX + col * cellSize;
      const label = String(col + 1);

      ctx.fillStyle = axisTextColor;
      ctx.fillText(label, axisX + cellSize / 2, layout.topAxisY + layout.axisLabelSize / 2);
      ctx.fillText(label, axisX + cellSize / 2, layout.bottomAxisY + layout.axisLabelSize / 2);
    }

    for (let row = 0; row < M; row++) {
      const axisY = layout.originY + row * cellSize;
      const label = String(row + 1);

      ctx.fillStyle = axisTextColor;
      ctx.fillText(label, layout.leftAxisX + layout.axisLabelSize / 2, axisY + cellSize / 2);
      ctx.fillText(label, layout.rightAxisX + layout.axisLabelSize / 2, axisY + cellSize / 2);
    }
  }

  const fontSize = Math.max(5, Math.min(10, Math.floor(cellSize * 0.34)));
  ctx.font = `500 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let row = 0; row < M; row++) {
    for (let col = 0; col < N; col++) {
      const cellData = dataToDraw[row]?.[col];
      const drawX = layout.originX + col * cellSize;
      const drawY = layout.originY + row * cellSize;

      if (cellData && !cellData.isExternal && cellData.key !== TRANSPARENT_KEY) {
        const cellColor = cellData.color || '#FFFFFF';
        ctx.fillStyle = cellColor;
        ctx.fillRect(drawX, drawY, cellSize, cellSize);

        if (showCellNumbers) {
          ctx.fillStyle = getContrastColor(cellColor);
          ctx.fillText(
            getMappedColorDisplayKey(cellColor, selectedColorSystem, cellData.key),
            drawX + cellSize / 2,
            drawY + cellSize / 2
          );
        }
      } else {
        ctx.fillStyle = backgroundCellColor;
        ctx.fillRect(drawX, drawY, cellSize, cellSize);
      }
    }
  }

  ctx.strokeStyle = baseGridLineColor;
  ctx.lineWidth = baseGridLineWidth;
  ctx.beginPath();
  for (let col = 1; col < N; col++) {
    const lineX = layout.originX + col * cellSize;
    ctx.moveTo(lineX, layout.originY);
    ctx.lineTo(lineX, layout.originY + layout.gridHeight);
  }
  for (let row = 1; row < M; row++) {
    const lineY = layout.originY + row * cellSize;
    ctx.moveTo(layout.originX, lineY);
    ctx.lineTo(layout.originX + layout.gridWidth, lineY);
  }
  ctx.stroke();

  if (showGrid) {
    ctx.strokeStyle = majorGridLineColor;
    ctx.lineWidth = majorGridLineWidth;

    for (let col = gridInterval; col < N; col += gridInterval) {
      const lineX = layout.originX + col * cellSize;
      ctx.beginPath();
      ctx.moveTo(lineX, layout.originY);
      ctx.lineTo(lineX, layout.originY + layout.gridHeight);
      ctx.stroke();
    }

    for (let row = gridInterval; row < M; row += gridInterval) {
      const lineY = layout.originY + row * cellSize;
      ctx.beginPath();
      ctx.moveTo(layout.originX, lineY);
      ctx.lineTo(layout.originX + layout.gridWidth, lineY);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = '#55524C';
  ctx.lineWidth = majorGridLineWidth;
  ctx.strokeRect(
    layout.originX + 0.5,
    layout.originY + 0.5,
    layout.gridWidth,
    layout.gridHeight
  );

  const highlightedCellKeys = new Set([
    ...selectedCells.map(cell => `${cell.row}:${cell.col}`),
    ...previewCells.map(cell => `${cell.row}:${cell.col}`),
  ]);

  if (highlightedCellKeys.size > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.34)';
    ctx.strokeStyle = 'rgba(185, 28, 28, 0.95)';
    ctx.lineWidth = Math.max(1, cellSize * 0.08);

    highlightedCellKeys.forEach(key => {
      const [rowText, colText] = key.split(':');
      const row = Number(rowText);
      const col = Number(colText);
      ctx.fillRect(layout.originX + col * cellSize, layout.originY + row * cellSize, cellSize, cellSize);
      ctx.strokeRect(layout.originX + col * cellSize + 0.5, layout.originY + row * cellSize + 0.5, cellSize - 1, cellSize - 1);
    });

    ctx.restore();
  }

  if (rectangleBounds) {
    const minX = Math.min(rectangleBounds.start.x, rectangleBounds.current.x);
    const minY = Math.min(rectangleBounds.start.y, rectangleBounds.current.y);
    const width = Math.abs(rectangleBounds.current.x - rectangleBounds.start.x);
    const height = Math.abs(rectangleBounds.current.y - rectangleBounds.start.y);

    ctx.save();
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(minX, minY, width, height);
    ctx.restore();
  }

  if (selectionPath.length > 1) {
    ctx.save();
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(selectionPath[0].x, selectionPath[0].y);
    selectionPath.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
    ctx.stroke();
    ctx.restore();
  }

  if (includeStats && colorCounts && Object.keys(colorCounts).length > 0) {
    const colorKeys = Object.keys(colorCounts).sort(sortColorKeys);
    const padding = 20;
    const availableWidth = layout.width - padding * 2;
    const columns = Math.max(1, Math.min(10, Math.floor(availableWidth / 120)));
    const itemWidth = availableWidth / columns;
    const swatchWidth = Math.max(42, Math.min(72, itemWidth - 18));
    const swatchHeight = Math.max(24, Math.min(36, Math.round(cellSize * 1.25)));

    ctx.strokeStyle = '#DED9CF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, layout.statsY);
    ctx.lineTo(layout.width - padding, layout.statsY);
    ctx.stroke();

    ctx.fillStyle = '#A55B1E';
    ctx.font = '600 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('颜色统计', padding, layout.statsY + 24);
    ctx.fillStyle = '#7A746B';
    ctx.font = '500 10px sans-serif';
    ctx.fillText(`${colorKeys.length} 色 · ${totalBeadCount ?? 0} 颗`, padding + 58, layout.statsY + 24);

    colorKeys.forEach((key, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const centerX = padding + col * itemWidth + itemWidth / 2;
      const x = centerX - swatchWidth / 2;
      const y = layout.statsY + 42 + row * 68;
      const item = colorCounts[key];
      const color = item.color || key;
      const label = item.displayKey ?? getDisplayColorKey(color, selectedColorSystem);

      ctx.fillStyle = color;
      ctx.fillRect(x, y, swatchWidth, swatchHeight);
      ctx.strokeStyle = '#B9B4AB';
      ctx.lineWidth = 0.75;
      ctx.strokeRect(x + 0.5, y + 0.5, swatchWidth - 1, swatchHeight - 1);

      ctx.fillStyle = getContrastColor(color);
      ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, centerX, y + swatchHeight / 2);

      ctx.fillStyle = '#6F6A62';
      ctx.font = '500 9px sans-serif';
      ctx.fillText(`${item.count} 颗`, centerX, y + swatchHeight + 12);
    });

    ctx.fillStyle = '#8A847B';
    ctx.font = '500 9px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `${selectedColorSystem} · ${N}×${M} · ${colorKeys.length} 色 · ${totalBeadCount ?? 0} 颗`,
      layout.width - padding,
      layout.height - 12
    );
  }
};

const PixelatedPreviewCanvas: React.FC<PixelatedPreviewCanvasProps> = ({
  mappedPixelData,
  gridDimensions,
  isManualColoringMode,
  canvasRef,
  onInteraction,
  highlightColorKey,
  onHighlightComplete,
  selectionMode = 'none',
  selectedRegionCells = [],
  onRegionSelectionComplete,
  displayScale = 1,
  renderMode = 'editor',
  downloadOptions,
  colorCounts,
  totalBeadCount,
  selectedColorSystem = 'MARD',
  showReferenceGrid = true,
}) => {
  const [darkModeState, setDarkModeState] = useState<boolean | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number; pageX: number; pageY: number } | null>(null);
  const touchMovedRef = useRef<boolean>(false);
  const activeRegionPointerIdRef = useRef<number | null>(null);
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);
  const [selectionStart, setSelectionStart] = useState<CanvasPoint | null>(null);
  const [selectionCurrent, setSelectionCurrent] = useState<CanvasPoint | null>(null);
  const [lassoPoints, setLassoPoints] = useState<CanvasPoint[]>([]);
  const isRegionSelectionActive = selectionMode !== 'none';

  const previewRegionCells = useMemo(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mappedPixelData || !gridDimensions || !isRegionSelectionActive || !isSelectingRegion) {
      return [];
    }

    if (selectionMode === 'rectangle' && selectionStart && selectionCurrent) {
      return getCellsInRectangle(selectionStart, selectionCurrent, canvas, gridDimensions, mappedPixelData);
    }

    if (selectionMode === 'lasso' && lassoPoints.length > 0) {
      return getCellsInLasso(lassoPoints, canvas, gridDimensions, mappedPixelData);
    }

    return [];
  }, [
    canvasRef,
    gridDimensions,
    isRegionSelectionActive,
    isSelectingRegion,
    lassoPoints,
    mappedPixelData,
    selectionCurrent,
    selectionMode,
    selectionStart,
  ]);

  // Effect to detect dark mode changes and update state
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkDarkMode = () => {
        const isDark = document.documentElement.classList.contains('dark');
        // Only update state if it actually changes
        if (isDark !== darkModeState) {
            setDarkModeState(isDark);
        }
    };

    // Initial check
    checkDarkMode();

    // Use MutationObserver to watch for class changes on <html>
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // Cleanup observer on component unmount
    return () => observer.disconnect();

  }, [darkModeState]); // Depend on darkModeState to re-run if needed externally

  // Update useEffect for drawing to depend on darkModeState as well
  useEffect(() => {
    // Ensure darkModeState is not null before drawing
    if (mappedPixelData && gridDimensions && canvasRef.current && darkModeState !== null) {
      console.log(`Redrawing canvas, dark mode: ${darkModeState}`); // Log redraw trigger
      const patternLayout = renderMode === 'pattern'
        ? getPatternCanvasLayout(gridDimensions, downloadOptions, colorCounts)
        : null;
      const canvasSize = patternLayout ?? getResponsiveCanvasSize(gridDimensions);
      if (
        canvasRef.current.width !== canvasSize.width ||
        canvasRef.current.height !== canvasSize.height
      ) {
        canvasRef.current.width = canvasSize.width;
        canvasRef.current.height = canvasSize.height;
      }

      if (patternLayout) {
        setCanvasGridMetrics(canvasRef.current, patternLayout);
        drawPatternCanvas(
          mappedPixelData,
          canvasRef.current,
          gridDimensions,
          patternLayout,
          downloadOptions,
          colorCounts,
          totalBeadCount,
          selectedColorSystem,
          selectedRegionCells,
          previewRegionCells,
          selectionMode === 'lasso' && isSelectingRegion ? lassoPoints : [],
          selectionMode === 'rectangle' && isSelectingRegion && selectionStart && selectionCurrent
            ? { start: selectionStart, current: selectionCurrent }
            : null
        );
      } else {
        setCanvasGridMetrics(canvasRef.current, {
          originX: 0,
          originY: 0,
          cellWidth: canvasSize.width / gridDimensions.N,
          cellHeight: canvasSize.height / gridDimensions.M,
          gridWidth: canvasSize.width,
          gridHeight: canvasSize.height,
        });
        drawPixelatedCanvas(
          mappedPixelData,
          canvasRef.current,
          gridDimensions,
          highlightColorKey,
          isHighlighting,
          selectedRegionCells,
          previewRegionCells,
          selectionMode === 'lasso' && isSelectingRegion ? lassoPoints : [],
          selectionMode === 'rectangle' && isSelectingRegion && selectionStart && selectionCurrent
            ? { start: selectionStart, current: selectionCurrent }
            : null,
          selectedColorSystem,
          showReferenceGrid
        );
      }
    }
  }, [
    mappedPixelData,
    gridDimensions,
    canvasRef,
    renderMode,
    downloadOptions,
    colorCounts,
    totalBeadCount,
    selectedColorSystem,
    showReferenceGrid,
    darkModeState,
    highlightColorKey,
    isHighlighting,
    selectedRegionCells,
    previewRegionCells,
    selectionMode,
    isSelectingRegion,
    lassoPoints,
    selectionStart,
    selectionCurrent,
  ]); // Add darkModeState dependency

  const scaledCanvasWidth = useMemo(() => {
    if (!gridDimensions || displayScale === 1) return undefined;
    const layout = renderMode === 'pattern'
      ? getPatternCanvasLayout(gridDimensions, downloadOptions, colorCounts)
      : getResponsiveCanvasSize(gridDimensions);
    return `${Math.round(layout.width * displayScale)}px`;
  }, [colorCounts, displayScale, downloadOptions, gridDimensions, renderMode]);

  // 处理高亮效果
  useEffect(() => {
    if (highlightColorKey && mappedPixelData && gridDimensions) {
      setIsHighlighting(true);
      // 0.3秒后结束高亮
      const timer = setTimeout(() => {
        setIsHighlighting(false);
        onHighlightComplete?.();
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [highlightColorKey, mappedPixelData, gridDimensions, onHighlightComplete]);

  const startRegionSelection = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !mappedPixelData || !gridDimensions || !isRegionSelectionActive) return;

    const point = getCanvasPoint(canvas, clientX, clientY);
    setIsSelectingRegion(true);
    setSelectionStart(point);
    setSelectionCurrent(point);
    setLassoPoints(selectionMode === 'lasso' ? [point] : []);
    onInteraction(0, 0, 0, 0, false, true);
  };

  const moveRegionSelection = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !isSelectingRegion || !isRegionSelectionActive) return;

    const point = getCanvasPoint(canvas, clientX, clientY);
    setSelectionCurrent(point);

    if (selectionMode === 'lasso') {
      setLassoPoints(previousPoints => {
        const lastPoint = previousPoints[previousPoints.length - 1];
        if (!lastPoint) return [point];

        const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
        return distance >= 4 ? [...previousPoints, point] : previousPoints;
      });
    }
  };

  const finishRegionSelection = () => {
    const canvas = canvasRef.current;
    if (!canvas || !mappedPixelData || !gridDimensions || !isSelectingRegion || !isRegionSelectionActive) {
      setIsSelectingRegion(false);
      return;
    }

    let cells: RegionSelectionCell[] = [];

    if (selectionMode === 'rectangle' && selectionStart && selectionCurrent) {
      cells = getCellsInRectangle(selectionStart, selectionCurrent, canvas, gridDimensions, mappedPixelData);
    } else if (selectionMode === 'lasso') {
      cells = getCellsInLasso(lassoPoints, canvas, gridDimensions, mappedPixelData);
    }

    onRegionSelectionComplete?.(cells);
    setIsSelectingRegion(false);
    setSelectionStart(null);
    setSelectionCurrent(null);
    setLassoPoints([]);
  };

  const supportsPointerEvents = () => typeof window !== 'undefined' && 'PointerEvent' in window;

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isRegionSelectionActive) return;

    event.preventDefault();
    activeRegionPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    startRegionSelection(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isRegionSelectionActive || activeRegionPointerIdRef.current !== event.pointerId) return;

    event.preventDefault();
    moveRegionSelection(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isRegionSelectionActive || activeRegionPointerIdRef.current !== event.pointerId) return;

    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activeRegionPointerIdRef.current = null;
    finishRegionSelection();
  };

  // --- 鼠标事件处理 ---
  const handleMouseDown = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!isRegionSelectionActive) return;
    event.preventDefault();
    if (supportsPointerEvents()) return;
    startRegionSelection(event.clientX, event.clientY);
  };
  
  // 鼠标移动时显示提示
  const handleMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    if (isRegionSelectionActive) {
      if (isSelectingRegion) {
        if (supportsPointerEvents()) return;
        moveRegionSelection(event.clientX, event.clientY);
      }
      return;
    }

    // 只有在非手动模式下才通过mousemove显示tooltip，避免干扰手动上色
    if (!isManualColoringMode) {
        onInteraction(event.clientX, event.clientY, event.pageX, event.pageY, false);
    }
  };

  const handleMouseUp = () => {
    if (isRegionSelectionActive) {
      if (supportsPointerEvents()) return;
      finishRegionSelection();
    }
  };

  // 鼠标离开时隐藏提示
  const handleMouseLeave = () => {
    if (isRegionSelectionActive) {
      if (isSelectingRegion) {
        if (supportsPointerEvents()) return;
        finishRegionSelection();
      }
      return;
    }

    // 鼠标离开时总是隐藏tooltip
    onInteraction(0, 0, 0, 0, false, true);
  };

  // 鼠标点击处理（用于手动上色模式）
  const handleClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (isRegionSelectionActive) {
      event.preventDefault();
      return;
    }

    // 鼠标点击行为保持不变：
    // 手动模式下：上色
    // 非手动模式下：切换tooltip
    onInteraction(event.clientX, event.clientY, event.pageX, event.pageY, true);
  };

  // --- 触摸事件处理 ---
  // 用于检测触摸移动的参考
  const handleTouchStart = (event: TouchEvent<HTMLCanvasElement>) => {
    const touch = event.touches[0];
    if (!touch) return;

    if (isRegionSelectionActive) {
      event.preventDefault();
      if (supportsPointerEvents()) return;
      startRegionSelection(touch.clientX, touch.clientY);
      return;
    }

    // 记录起始位置并重置移动标志
    touchStartPosRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      pageX: touch.pageX,
      pageY: touch.pageY
    };
    touchMovedRef.current = false;

    // 在非手动模式下，触摸开始时仍然可以立即显示/切换tooltip，提供即时反馈
    if (!isManualColoringMode) {
        onInteraction(touch.clientX, touch.clientY, touch.pageX, touch.pageY, false);
    }
    // 注意：此处不再触发手动上色 (isClick: true)
  };
  
  // 触摸移动时检测是否需要隐藏提示
  const handleTouchMove = (event: TouchEvent<HTMLCanvasElement>) => {
    const touch = event.touches[0];
    if (!touch) return;

    if (isRegionSelectionActive) {
      event.preventDefault();
      if (supportsPointerEvents()) return;
      moveRegionSelection(touch.clientX, touch.clientY);
      return;
    }

    if (!touchStartPosRef.current) return;
    
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    
    // 如果移动超过阈值，则标记为已移动，并隐藏tooltip
    // 增加一个稍大的阈值，以更好地区分点击和微小的手指抖动/滑动意图
    if (!touchMovedRef.current && (dx > 10 || dy > 10)) {
      touchMovedRef.current = true;
      // 一旦确定是移动，就隐藏tooltip
      onInteraction(0, 0, 0, 0, false, true);
    }
  };
  
  // 触摸结束时不再自动隐藏提示框
  const handleTouchEnd = () => {
    if (isRegionSelectionActive) {
      if (supportsPointerEvents()) return;
      finishRegionSelection();
      return;
    }

    // 检查是否是手动模式，并且触摸没有移动（判定为点击）
    if (!touchMovedRef.current && touchStartPosRef.current) {
      // 使用触摸开始时的坐标来执行上色操作
      const { x, y, pageX, pageY } = touchStartPosRef.current;
      onInteraction(x, y, pageX, pageY, true); // isClick: true 表示执行上色或打开色块操作
    }

    // 重置触摸状态
    touchStartPosRef.current = null;
    touchMovedRef.current = false;
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd} // 添加 onTouchCancel 以处理触摸中断的情况
      className={`block h-auto max-w-full bg-[#fffefa] shadow-[0_3px_16px_rgba(77,64,45,0.13)] ${
        isRegionSelectionActive ? 'cursor-crosshair' : isManualColoringMode ? 'cursor-pointer' : 'cursor-grab' // 改为 grab 光标提示可以拖动
      }`}
      style={{
        imageRendering: 'pixelated',
        touchAction: isRegionSelectionActive ? 'none' : 'auto',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        maxWidth: displayScale > 1 ? 'none' : '100%',
        width: scaledCanvasWidth,
      }}
    />
  );
};

export default PixelatedPreviewCanvas;
