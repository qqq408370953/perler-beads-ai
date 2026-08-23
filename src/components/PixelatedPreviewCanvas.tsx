'use client';

import React, { useRef, useEffect, TouchEvent, MouseEvent, useMemo, useState } from 'react';
import { MappedPixel } from '../utils/pixelation';
import { TRANSPARENT_KEY } from '../utils/pixelEditingUtils';

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

const getCellsInRectangle = (
  start: CanvasPoint,
  current: CanvasPoint,
  canvas: HTMLCanvasElement,
  dims: { N: number; M: number },
  data: MappedPixel[][]
): RegionSelectionCell[] => {
  const cellWidth = canvas.width / dims.N;
  const cellHeight = canvas.height / dims.M;
  const minX = Math.min(start.x, current.x);
  const maxX = Math.max(start.x, current.x);
  const minY = Math.min(start.y, current.y);
  const maxY = Math.max(start.y, current.y);

  const startCol = Math.max(0, Math.floor(minX / cellWidth));
  const endCol = Math.min(dims.N - 1, Math.floor(Math.max(0, maxX - 0.01) / cellWidth));
  const startRow = Math.max(0, Math.floor(minY / cellHeight));
  const endRow = Math.min(dims.M - 1, Math.floor(Math.max(0, maxY - 0.01) / cellHeight));
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

    const cellWidth = canvas.width / dims.N;
    const cellHeight = canvas.height / dims.M;
    const col = Math.min(dims.N - 1, Math.max(0, Math.floor(point.x / cellWidth)));
    const row = Math.min(dims.M - 1, Math.max(0, Math.floor(point.y / cellHeight)));
    return isSelectableCell(data[row]?.[col]) ? [{ row, col }] : [];
  }

  const cellWidth = canvas.width / dims.N;
  const cellHeight = canvas.height / dims.M;
  const minX = Math.max(0, Math.min(...points.map(point => point.x)));
  const maxX = Math.min(canvas.width, Math.max(...points.map(point => point.x)));
  const minY = Math.max(0, Math.min(...points.map(point => point.y)));
  const maxY = Math.min(canvas.height, Math.max(...points.map(point => point.y)));
  const startCol = Math.max(0, Math.floor(minX / cellWidth));
  const endCol = Math.min(dims.N - 1, Math.floor(Math.max(0, maxX - 0.01) / cellWidth));
  const startRow = Math.max(0, Math.floor(minY / cellHeight));
  const endRow = Math.min(dims.M - 1, Math.floor(Math.max(0, maxY - 0.01) / cellHeight));
  const cells: RegionSelectionCell[] = [];

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      if (!isSelectableCell(data[row]?.[col])) continue;

      const center = {
        x: col * cellWidth + cellWidth / 2,
        y: row * cellHeight + cellHeight / 2,
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
  rectangleBounds?: { start: CanvasPoint; current: CanvasPoint } | null
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

  // Respect current dark mode preference
  const isDarkMode = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');

  // Define colors based on mode
  const externalBackgroundColor = isDarkMode ? '#374151' : '#F3F4F6'; // gray-700 : gray-100
  const gridLineColor = isDarkMode ? '#4B5563' : '#DDDDDD'; // gray-600 : lighter gray

  const { N, M } = dims;
  const outputWidth = canvas.width;
  const outputHeight = canvas.height;
  const cellWidthOutput = outputWidth / N;
  const cellHeightOutput = outputHeight / M;

  pixelatedCtx.clearRect(0, 0, outputWidth, outputHeight);
  pixelatedCtx.lineWidth = 0.5; // Keep line width thin

  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const cellData = dataToDraw[j]?.[i];
      if (!cellData) continue;

      const drawX = i * cellWidthOutput;
      const drawY = j * cellHeightOutput;

      // Fill cell color using mode-specific background for external cells
      if (cellData.isExternal) {
        pixelatedCtx.fillStyle = externalBackgroundColor;
      } else {
        pixelatedCtx.fillStyle = cellData.color;
      }
      pixelatedCtx.fillRect(drawX, drawY, cellWidthOutput, cellHeightOutput);

      // 如果正在高亮且当前单元格不是目标颜色，添加半透明黑色蒙版
      if (isHighlighting && highlightColorKey) {
        let shouldDim = false;
        
        if (cellData.isExternal) {
          // 外部单元格总是变深色（因为它们不是要高亮的颜色）
          shouldDim = true;
        } else {
          // 内部单元格：如果颜色不匹配则变深色
          shouldDim = cellData.color.toUpperCase() !== highlightColorKey.toUpperCase();
        }
        
        if (shouldDim) {
          pixelatedCtx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // 60% 透明度的黑色蒙版
          pixelatedCtx.fillRect(drawX, drawY, cellWidthOutput, cellHeightOutput);
        }
      }

      // Draw grid lines using mode-specific color
      pixelatedCtx.strokeStyle = gridLineColor;
      pixelatedCtx.strokeRect(drawX + 0.5, drawY + 0.5, cellWidthOutput, cellHeightOutput);
    }
  }

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
}) => {
  const [darkModeState, setDarkModeState] = useState<boolean | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number; pageX: number; pageY: number } | null>(null);
  const touchMovedRef = useRef<boolean>(false);
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
          : null
      );
    }
  }, [
    mappedPixelData,
    gridDimensions,
    canvasRef,
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

  // --- 鼠标事件处理 ---
  const handleMouseDown = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!isRegionSelectionActive) return;
    event.preventDefault();
    startRegionSelection(event.clientX, event.clientY);
  };
  
  // 鼠标移动时显示提示
  const handleMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    if (isRegionSelectionActive) {
      if (isSelectingRegion) {
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
      finishRegionSelection();
    }
  };

  // 鼠标离开时隐藏提示
  const handleMouseLeave = () => {
    if (isRegionSelectionActive) {
      if (isSelectingRegion) {
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd} // 添加 onTouchCancel 以处理触摸中断的情况
      className={`border border-gray-300 dark:border-gray-600 max-w-full h-auto rounded block ${
        isRegionSelectionActive ? 'cursor-crosshair' : isManualColoringMode ? 'cursor-pointer' : 'cursor-grab' // 改为 grab 光标提示可以拖动
      }`}
      style={{
        imageRendering: 'pixelated',
        touchAction: isRegionSelectionActive ? 'none' : 'auto',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    />
  );
};

export default PixelatedPreviewCanvas;
