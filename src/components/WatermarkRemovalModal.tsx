'use client';

/* eslint-disable @next/next/no-img-element */

import { PointerEvent, useEffect, useRef, useState } from 'react';
import { removeWatermarkRegion } from '../utils/watermarkRemoval';
import type { WatermarkSelection } from '../utils/watermarkRemoval';

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const resizeHandles: Array<{ handle: ResizeHandle; label: string; className: string }> = [
  { handle: 'nw', label: '拖动左上角调整选区', className: '-left-2 -top-2 cursor-nwse-resize' },
  { handle: 'n', label: '拖动上边调整选区', className: 'left-1/2 -top-2 -translate-x-1/2 cursor-ns-resize' },
  { handle: 'ne', label: '拖动右上角调整选区', className: '-right-2 -top-2 cursor-nesw-resize' },
  { handle: 'e', label: '拖动右边调整选区', className: '-right-2 top-1/2 -translate-y-1/2 cursor-ew-resize' },
  { handle: 'se', label: '拖动右下角调整选区', className: '-bottom-2 -right-2 cursor-nwse-resize' },
  { handle: 's', label: '拖动下边调整选区', className: '-bottom-2 left-1/2 -translate-x-1/2 cursor-ns-resize' },
  { handle: 'sw', label: '拖动左下角调整选区', className: '-bottom-2 -left-2 cursor-nesw-resize' },
  { handle: 'w', label: '拖动左边调整选区', className: '-left-2 top-1/2 -translate-y-1/2 cursor-ew-resize' },
];

const defaultSelection: WatermarkSelection = { x: 70, y: 84, width: 30, height: 16 };

interface WatermarkRemovalModalProps {
  imageSrc: string;
  isOpen: boolean;
  onClose: () => void;
  onContinue: (imageSrc: string) => void;
  title?: string;
  description?: string;
  continueLabel?: string;
  completedContinueLabel?: string;
  completedMessage?: string;
}

export default function WatermarkRemovalModal({
  imageSrc,
  isOpen,
  onClose,
  onContinue,
  title = '生成前手动去水印',
  description = '拖动黄色选区覆盖水印，处理完成后再进入裁剪',
  continueLabel = '跳过并去裁剪',
  completedContinueLabel = '完成并去裁剪',
  completedMessage = '可继续框选或进入裁剪。',
}: WatermarkRemovalModalProps) {
  const [workingImageSrc, setWorkingImageSrc] = useState(imageSrc);
  const [selection, setSelection] = useState<WatermarkSelection>(defaultSelection);
  const [isProcessing, setIsProcessing] = useState(false);
  const [removedCount, setRemovedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    mode: 'move' | 'resize';
    handle?: ResizeHandle;
    startClientX: number;
    startClientY: number;
    startSelection: WatermarkSelection;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setWorkingImageSrc(imageSrc);
    setSelection(defaultSelection);
    setRemovedCount(0);
    setError(null);
    setIsProcessing(false);
  }, [imageSrc, isOpen]);

  const updateSelection = (patch: Partial<WatermarkSelection>) => {
    setSelection(current => {
      const next = { ...current, ...patch };
      const width = Math.min(100, Math.max(4, next.width));
      const height = Math.min(100, Math.max(4, next.height));
      const x = Math.min(100 - width, Math.max(0, next.x));
      const y = Math.min(100 - height, Math.max(0, next.y));
      return { x, y, width, height };
    });
  };

  const handleSelectionPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isProcessing) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      mode: 'move',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSelection: { ...selection },
    };
  };

  const handleResizePointerDown = (handle: ResizeHandle, event: PointerEvent<HTMLDivElement>) => {
    if (isProcessing) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      mode: 'resize',
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSelection: { ...selection },
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const preview = previewRef.current;
    if (!drag || !preview || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    const rect = preview.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const deltaX = ((event.clientX - drag.startClientX) / rect.width) * 100;
    const deltaY = ((event.clientY - drag.startClientY) / rect.height) * 100;
    const start = drag.startSelection;

    if (drag.mode === 'move') {
      updateSelection({ x: start.x + deltaX, y: start.y + deltaY });
      return;
    }

    const minSize = 4;
    const startRight = start.x + start.width;
    const startBottom = start.y + start.height;
    let x = start.x;
    let y = start.y;
    let width = start.width;
    let height = start.height;

    if (drag.handle?.includes('w')) {
      x = Math.min(startRight - minSize, Math.max(0, start.x + deltaX));
      width = startRight - x;
    }
    if (drag.handle?.includes('e')) {
      width = Math.min(100 - start.x, Math.max(minSize, start.width + deltaX));
    }
    if (drag.handle?.includes('n')) {
      y = Math.min(startBottom - minSize, Math.max(0, start.y + deltaY));
      height = startBottom - y;
    }
    if (drag.handle?.includes('s')) {
      height = Math.min(100 - start.y, Math.max(minSize, start.height + deltaY));
    }

    updateSelection({ x, y, width, height });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleApply = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const cleanedImage = await removeWatermarkRegion(workingImageSrc, selection);
      setWorkingImageSrc(cleanedImage);
      setRemovedCount(count => count + 1);
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : '去水印失败，请调整选区后重试');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="watermark-removal-title">
      <div className="max-h-[96vh] w-full overflow-y-auto rounded-t-2xl bg-[#fffdf8] shadow-2xl sm:max-w-5xl sm:rounded-2xl dark:bg-gray-900">
        <div className="flex items-start justify-between gap-4 border-b border-[#e7dfd4] px-5 py-4 dark:border-gray-700">
          <div>
            <h2 id="watermark-removal-title" className="text-xl font-black text-[#2e2924] dark:text-white">{title}</h2>
            <p className="mt-1 text-sm font-semibold text-[#81786d] dark:text-gray-300">{description}</p>
          </div>
          <button type="button" onClick={onClose} disabled={isProcessing} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#ded5c9] text-2xl text-[#766e65] hover:bg-[#f8f1e8] disabled:opacity-50 dark:border-gray-600 dark:text-gray-200" aria-label="关闭去水印">
            ×
          </button>
        </div>

        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-xl border border-[#e2d8ca] bg-[#f1e9dd] p-3 text-center dark:border-gray-700 dark:bg-gray-800">
            <div ref={previewRef} className="relative inline-block max-h-[68vh] max-w-full overflow-hidden shadow-lg">
              <img src={workingImageSrc} alt="待去水印原图" className="block max-h-[68vh] max-w-full object-contain" />
              <div
                className="absolute cursor-move touch-none border-2 border-amber-400 bg-amber-300/25 shadow-[0_0_0_9999px_rgba(0,0,0,0.2)]"
                role="button"
                tabIndex={0}
                aria-label="拖动调整去水印选区"
                onPointerDown={handleSelectionPointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{ left: `${selection.x}%`, top: `${selection.y}%`, width: `${selection.width}%`, height: `${selection.height}%` }}
              >
                {resizeHandles.map(handle => (
                  <div
                    key={handle.handle}
                    role="button"
                    tabIndex={0}
                    aria-label={handle.label}
                    onPointerDown={event => handleResizePointerDown(handle.handle, event)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className={`absolute h-4 w-4 rounded-full border-2 border-white bg-amber-500 shadow ${handle.className}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-[#e5ddd2] bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="text-sm font-black text-[#332d27] dark:text-white">常用位置</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { label: '右下贴边', value: { x: 70, y: 84, width: 30, height: 16 } },
                  { label: '左下贴边', value: { x: 0, y: 84, width: 30, height: 16 } },
                  { label: '底部整条', value: { x: 0, y: 84, width: 100, height: 16 } },
                  { label: '右上角', value: { x: 70, y: 0, width: 30, height: 16 } },
                ].map(preset => (
                  <button key={preset.label} type="button" onClick={() => setSelection(preset.value)} disabled={isProcessing} className="rounded-lg border border-[#ddd4c8] px-3 py-2 text-sm font-bold text-[#675f56] hover:bg-[#fff7ec] disabled:opacity-50 dark:border-gray-600 dark:text-gray-200">
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#e5ddd2] bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="text-sm font-black text-[#332d27] dark:text-white">选区调整</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-[#70685f] dark:text-gray-300">
                <div className="rounded-lg bg-[#f5f0e9] px-3 py-2 dark:bg-gray-700">位置 {Math.round(selection.x)}%, {Math.round(selection.y)}%</div>
                <div className="rounded-lg bg-[#f5f0e9] px-3 py-2 dark:bg-gray-700">大小 {Math.round(selection.width)}% × {Math.round(selection.height)}%</div>
              </div>
              <p className="mt-3 text-sm font-semibold leading-6 text-[#7d756c] dark:text-gray-300">拖动选区移动位置，拖动八个圆点调整大小。水印较多时可以连续处理多个区域。</p>
            </div>

            <div className="rounded-xl bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              使用项目原有的本地去水印方法，用选区周边颜色覆盖水印，适合白底、浅色背景和边角水印。请避免覆盖主体。
            </div>

            {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
            {removedCount > 0 && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">已处理 {removedCount} 个水印区域，{completedMessage}</div>}

            <button type="button" onClick={handleApply} disabled={isProcessing} className="min-h-11 w-full rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50">
              {isProcessing ? '正在移除水印…' : '移除框选水印'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setWorkingImageSrc(imageSrc); setRemovedCount(0); setError(null); }} disabled={isProcessing || removedCount === 0} className="min-h-11 rounded-xl border border-[#ddd4c8] bg-white px-3 py-2 text-sm font-black text-[#675f56] disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">恢复原图</button>
              <button type="button" onClick={() => onContinue(workingImageSrc)} disabled={isProcessing} className="min-h-11 rounded-xl bg-[#ef872d] px-3 py-2 text-sm font-black text-white shadow-sm hover:bg-[#db7520] disabled:opacity-50">{removedCount > 0 ? completedContinueLabel : continueLabel}</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
