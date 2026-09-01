'use client';

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { GalleryPattern, galleryPatterns } from '../../../data/galleryPatterns';
import {
  clearLocalGalleryPatterns,
  deleteLocalGalleryPattern,
  getLocalGalleryPatterns,
  saveLocalGalleryPatterns,
} from '../../../utils/galleryLocalStore';
import { removeWatermarkRegion } from '../../../utils/watermarkRemoval';
import type { WatermarkSelection } from '../../../utils/watermarkRemoval';

interface EditablePattern {
  id: string;
  source?: 'static' | 'local';
  title: string;
  category: string;
  gridSize: string;
  colorCount: string;
  originalImage: string;
  originalName: string;
  patternPreviewImage: string;
  patternName: string;
  cloudDriveUrl: string;
  cloudDriveLabel: string;
  cloudDrivePassword: string;
  cloudDriveText: string;
  description: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

interface WatermarkEditorState {
  rowId: string;
  imageSrc: string;
  title: string;
  selection: WatermarkSelection;
  isProcessing: boolean;
}

interface ImagePreviewState {
  rowId?: string;
  imageSrc: string;
  title: string;
  kind: 'original' | 'pattern';
  canSave: boolean;
}

type WatermarkResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const watermarkResizeHandles: Array<{
  handle: WatermarkResizeHandle;
  label: string;
  className: string;
}> = [
  { handle: 'nw', label: '拖动左上角调整选区', className: '-left-2 -top-2 cursor-nwse-resize' },
  { handle: 'n', label: '拖动上边调整选区', className: 'left-1/2 -top-2 -translate-x-1/2 cursor-ns-resize' },
  { handle: 'ne', label: '拖动右上角调整选区', className: '-right-2 -top-2 cursor-nesw-resize' },
  { handle: 'e', label: '拖动右边调整选区', className: '-right-2 top-1/2 -translate-y-1/2 cursor-ew-resize' },
  { handle: 'se', label: '拖动右下角调整选区', className: '-bottom-2 -right-2 cursor-nwse-resize' },
  { handle: 's', label: '拖动下边调整选区', className: '-bottom-2 left-1/2 -translate-x-1/2 cursor-ns-resize' },
  { handle: 'sw', label: '拖动左下角调整选区', className: '-bottom-2 -left-2 cursor-nesw-resize' },
  { handle: 'w', label: '拖动左边调整选区', className: '-left-2 top-1/2 -translate-y-1/2 cursor-ew-resize' },
];

const emptyRow = (): EditablePattern => ({
  id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: '',
  category: '未分类',
  gridSize: '',
  colorCount: '',
  originalImage: '',
  originalName: '',
  patternPreviewImage: '',
  patternName: '',
  cloudDriveUrl: '',
  cloudDriveLabel: '夸克网盘',
  cloudDrivePassword: '',
  cloudDriveText: '',
  description: '',
});

function stripExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, '');
}

function normalizeId(text: string) {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || `pattern-${Date.now()}`;
}

function naturalSortFiles(files: File[]) {
  return files.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }));
}

function resizeFileToDataUrl(file: File, maxSide: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('无法处理图片'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => reject(new Error(`图片加载失败：${file.name}`));
      img.src = String(reader.result);
    };

    reader.onerror = () => reject(new Error(`读取文件失败：${file.name}`));
    reader.readAsDataURL(file);
  });
}


function toEditablePattern(pattern: GalleryPattern, source: 'static' | 'local' = 'static'): EditablePattern {
  return {
    id: pattern.id,
    source,
    title: pattern.title,
    category: pattern.category,
    gridSize: pattern.gridSize,
    colorCount: String(pattern.colorCount || ''),
    originalImage: pattern.originalImage,
    originalName: '',
    patternPreviewImage: pattern.patternPreviewImage ?? '',
    patternName: '',
    cloudDriveUrl: pattern.cloudDriveUrl,
    cloudDriveLabel: pattern.cloudDriveLabel ?? '夸克网盘',
    cloudDrivePassword: pattern.cloudDrivePassword ?? '',
    cloudDriveText: pattern.cloudDriveText ?? '',
    description: pattern.description ?? '',
  };
}

function toGalleryPattern(row: EditablePattern): GalleryPattern {
  return {
    id: row.id,
    title: row.title.trim() || row.id,
    category: row.category.trim() || '未分类',
    gridSize: row.gridSize.trim() || '未填写',
    colorCount: Number.parseInt(row.colorCount, 10) || 0,
    originalImage: row.originalImage,
    patternPreviewImage: row.patternPreviewImage || undefined,
    cloudDriveUrl: row.cloudDriveUrl.trim(),
    cloudDriveLabel: row.cloudDriveLabel.trim() || '网盘',
    cloudDrivePassword: row.cloudDrivePassword.trim() || undefined,
    cloudDriveText: row.cloudDriveText.trim() || undefined,
    description: row.description.trim() || undefined,
  };
}

export default function GalleryManageClient() {
  const [rows, setRows] = useState<EditablePattern[]>([]);
  const [savedRows, setSavedRows] = useState<EditablePattern[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [watermarkEditor, setWatermarkEditor] = useState<WatermarkEditorState | null>(null);
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const watermarkPreviewRef = useRef<HTMLDivElement | null>(null);
  const watermarkDragRef = useRef<{
    pointerId: number;
    mode: 'move' | 'resize';
    handle?: WatermarkResizeHandle;
    startClientX: number;
    startClientY: number;
    startSelection: WatermarkSelection;
  } | null>(null);

  const validRows = useMemo(() => (
    rows.filter((row) => row.originalImage && row.title.trim() && row.cloudDriveUrl.trim())
  ), [rows]);
  const allGalleryRows = useMemo(() => {
    const staticIds = new Set(galleryPatterns.map((pattern) => pattern.id));
    const savedById = new Map(savedRows.map((row) => [row.id, row]));
    const overriddenStaticRows = galleryPatterns.map((pattern) => (
      savedById.get(pattern.id) ?? toEditablePattern(pattern, 'static')
    ));
    const localOnlyRows = savedRows.filter((row) => !staticIds.has(row.id));

    return [...localOnlyRows, ...overriddenStaticRows].slice().reverse();
  }, [savedRows]);

  useEffect(() => {
    getLocalGalleryPatterns().then((patterns) => {
      setSavedRows(patterns.map((pattern) => toEditablePattern(pattern, 'local')));
    });
  }, []);

  const updateRow = (id: string, patch: Partial<EditablePattern>) => {
    setRows((currentRows) => (
      currentRows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    ));
    setSaveState('idle');
  };

  const removeDraftRow = (id: string) => {
    setRows((currentRows) => currentRows.filter((row) => row.id !== id));
  };

  const addBlankRow = () => {
    setRows((currentRows) => [...currentRows, emptyRow()]);
  };

  const handleBatchFiles = async (
    event: ChangeEvent<HTMLInputElement>,
    type: 'original' | 'pattern'
  ) => {
    const files = naturalSortFiles(Array.from(event.target.files ?? []));
    if (files.length === 0) return;

    setError(null);

    try {
      const images = await Promise.all(
        files.map((file) => resizeFileToDataUrl(file, type === 'original' ? 900 : 1400))
      );

      setRows((currentRows) => {
        const nextRows = currentRows.length > 0
          ? currentRows.slice()
          : files.map(() => emptyRow());

        while (nextRows.length < files.length) {
          nextRows.push(emptyRow());
        }

        files.forEach((file, index) => {
          const row = nextRows[index];
          const fallbackTitle = stripExtension(file.name)
            .replace(/[-_]+/g, ' ')
            .trim();
          const patch = type === 'original'
            ? {
              originalImage: images[index],
              originalName: file.name,
              title: row.title || fallbackTitle,
              id: row.id.startsWith('local-') ? `local-${normalizeId(file.name)}-${index + 1}` : row.id,
            }
            : {
              patternPreviewImage: images[index],
              patternName: file.name,
            };

          nextRows[index] = { ...row, ...patch };
        });

        return nextRows;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量读取图片失败');
    } finally {
      event.target.value = '';
    }
  };

  const reloadSavedRows = async () => {
    const saved = await getLocalGalleryPatterns();
    setSavedRows(saved.map((pattern) => toEditablePattern(pattern, 'local')));
  };

  const validateRowsForSave = (rowsToSave: EditablePattern[]) => {
    if (rowsToSave.length === 0) {
      throw new Error('至少需要一条包含原图、标题和网盘链接的记录');
    }

    const duplicateIds = new Set<string>();
    const ids = new Set<string>();
    rowsToSave.forEach((row) => {
      if (ids.has(row.id)) duplicateIds.add(row.id);
      ids.add(row.id);
    });
    if (duplicateIds.size > 0) {
      throw new Error(`存在重复 ID：${Array.from(duplicateIds).join(', ')}`);
    }
  };

  const handleSave = async () => {
    setSaveState('saving');
    setError(null);

    try {
      validateRowsForSave(validRows);
      await saveLocalGalleryPatterns(validRows.map(toGalleryPattern));
      await reloadSavedRows();
      setRows([]);
      setSaveState('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      setSaveState('failed');
    }
  };

  const handleSavePreviewRow = async () => {
    if (!imagePreview?.rowId) return;

    setSaveState('saving');
    setError(null);

    try {
      const rowToSave = rows.find((row) => row.id === imagePreview.rowId);
      if (!rowToSave) {
        throw new Error('未找到当前预览对应的编辑记录');
      }

      validateRowsForSave([rowToSave]);
      await saveLocalGalleryPatterns([toGalleryPattern(rowToSave)]);
      await reloadSavedRows();
      setRows((currentRows) => currentRows.filter((row) => row.id !== rowToSave.id));
      setImagePreview(null);
      setSaveState('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      setSaveState('failed');
    }
  };

  const handleEditSaved = (row: EditablePattern) => {
    setRows((currentRows) => {
      if (currentRows.some((item) => item.id === row.id)) return currentRows;
      return [{ ...row, source: 'local' }, ...currentRows];
    });
  };

  const handleOpenWatermarkEditor = (row: EditablePattern) => {
    if (!row.originalImage) {
      setError('请先上传原图再去水印');
      return;
    }

    handleEditSaved(row);
    setWatermarkEditor({
      rowId: row.id,
      imageSrc: row.originalImage,
      title: row.title || '原图',
      selection: {
        x: 70,
        y: 84,
        width: 30,
        height: 16,
      },
      isProcessing: false,
    });
  };

  const handleSingleImageChange = async (
    event: ChangeEvent<HTMLInputElement>,
    id: string,
    type: 'original' | 'pattern'
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    try {
      const image = await resizeFileToDataUrl(file, type === 'original' ? 900 : 1400);
      updateRow(
        id,
        type === 'original'
          ? { originalImage: image, originalName: file.name }
          : { patternPreviewImage: image, patternName: file.name }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取图片失败');
    } finally {
      event.target.value = '';
    }
  };

  const handleOpenImagePreview = (
    row: EditablePattern,
    kind: 'original' | 'pattern',
    canSave = false
  ) => {
    const imageSrc = kind === 'original' ? row.originalImage : row.patternPreviewImage;
    if (!imageSrc) return;

    setImagePreview({
      rowId: row.id,
      imageSrc,
      title: `${row.title || '未命名'} · ${kind === 'original' ? '原图' : '图纸'}`,
      kind,
      canSave,
    });
  };

  const updateWatermarkSelection = (patch: Partial<WatermarkSelection>) => {
    setWatermarkEditor((current) => {
      if (!current) return current;
      const nextSelection = { ...current.selection, ...patch };
      const width = Math.min(100, Math.max(4, nextSelection.width));
      const height = Math.min(100, Math.max(4, nextSelection.height));
      const x = Math.min(100 - width, Math.max(0, nextSelection.x));
      const y = Math.min(100 - height, Math.max(0, nextSelection.y));

      return {
        ...current,
        selection: { x, y, width, height },
      };
    });
  };

  const handleWatermarkSelectionPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!watermarkEditor?.selection || watermarkEditor.isProcessing) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    watermarkDragRef.current = {
      pointerId: event.pointerId,
      mode: 'move',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSelection: { ...watermarkEditor.selection },
    };
  };

  const handleWatermarkResizePointerDown = (
    handle: WatermarkResizeHandle,
    event: PointerEvent<HTMLDivElement>
  ) => {
    if (!watermarkEditor?.selection || watermarkEditor.isProcessing) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    watermarkDragRef.current = {
      pointerId: event.pointerId,
      mode: 'resize',
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSelection: { ...watermarkEditor.selection },
    };
  };

  const handleWatermarkSelectionPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = watermarkDragRef.current;
    const preview = watermarkPreviewRef.current;
    if (!dragState || !watermarkEditor || !preview || dragState.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    const rect = preview.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const deltaXPercent = ((event.clientX - dragState.startClientX) / rect.width) * 100;
    const deltaYPercent = ((event.clientY - dragState.startClientY) / rect.height) * 100;

    if (dragState.mode === 'move') {
      updateWatermarkSelection({
        x: dragState.startSelection.x + deltaXPercent,
        y: dragState.startSelection.y + deltaYPercent,
      });
      return;
    }

    const minSize = 4;
    const start = dragState.startSelection;
    const startRight = start.x + start.width;
    const startBottom = start.y + start.height;
    let nextX = start.x;
    let nextY = start.y;
    let nextWidth = start.width;
    let nextHeight = start.height;
    const handle = dragState.handle;

    if (handle?.includes('w')) {
      nextX = Math.min(startRight - minSize, Math.max(0, start.x + deltaXPercent));
      nextWidth = startRight - nextX;
    }

    if (handle?.includes('e')) {
      nextWidth = Math.min(100 - start.x, Math.max(minSize, start.width + deltaXPercent));
    }

    if (handle?.includes('n')) {
      nextY = Math.min(startBottom - minSize, Math.max(0, start.y + deltaYPercent));
      nextHeight = startBottom - nextY;
    }

    if (handle?.includes('s')) {
      nextHeight = Math.min(100 - start.y, Math.max(minSize, start.height + deltaYPercent));
    }

    updateWatermarkSelection({
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight,
    });
  };

  const handleWatermarkSelectionPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (watermarkDragRef.current?.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    watermarkDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleApplyWatermarkRemoval = async () => {
    if (!watermarkEditor) return;

    setError(null);
    setWatermarkEditor((current) => current ? { ...current, isProcessing: true } : current);

    try {
      const cleanedImage = await removeWatermarkRegion(watermarkEditor.imageSrc, watermarkEditor.selection);
      updateRow(watermarkEditor.rowId, {
        originalImage: cleanedImage,
        originalName: '已去水印原图',
      });
      setWatermarkEditor(null);
      setImagePreview({
        rowId: watermarkEditor.rowId,
        imageSrc: cleanedImage,
        title: `${watermarkEditor.title} · 去水印效果`,
        kind: 'original',
        canSave: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '去水印失败');
      setWatermarkEditor((current) => current ? { ...current, isProcessing: false } : current);
    }
  };

  const handleDeleteSaved = async (id: string) => {
    await deleteLocalGalleryPattern(id);
    setSavedRows((currentRows) => currentRows.filter((row) => row.id !== id));
  };

  const handleClearSaved = async () => {
    if (!window.confirm('确定清空本地保存的图纸记录吗？')) return;
    await clearLocalGalleryPatterns();
    setSavedRows([]);
  };

  return (
    <main className="min-h-screen bg-stone-50 text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/gallery" className="text-base font-black text-stone-900">
            图纸广场管理
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/gallery" className="rounded-md border border-stone-300 px-4 py-2 text-sm font-bold hover:bg-stone-100">
              返回广场
            </Link>
            <Link href="/" className="rounded-md bg-stone-950 px-4 py-2 text-sm font-bold text-white hover:bg-stone-800">
              返回工具
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block rounded-md border border-dashed border-stone-300 p-4">
                <span className="block text-sm font-black text-stone-900">批量上传原图</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => handleBatchFiles(event, 'original')}
                  className="mt-3 block w-full text-sm"
                />
              </label>
              <label className="block rounded-md border border-dashed border-stone-300 p-4">
                <span className="block text-sm font-black text-stone-900">批量上传对应图纸</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => handleBatchFiles(event, 'pattern')}
                  className="mt-3 block w-full text-sm"
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-2xl font-black">{rows.length}</div>
                <div className="text-xs font-bold text-stone-500">待保存</div>
              </div>
              <div>
                <div className="text-2xl font-black">{validRows.length}</div>
                <div className="text-xs font-bold text-stone-500">有效记录</div>
              </div>
              <div>
                <div className="text-2xl font-black">{allGalleryRows.length}</div>
                <div className="text-xs font-bold text-stone-500">广场总数</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveState === 'saving' || validRows.length === 0}
              className="mt-4 min-h-11 w-full rounded-md bg-orange-500 px-4 py-2 text-sm font-black text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveState === 'saving' ? '保存中...' : saveState === 'saved' ? '已保存到广场' : '保存到广场'}
            </button>
            {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
          </div>
        </div>

        <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-stone-200 p-4">
            <h1 className="text-lg font-black">待编辑记录</h1>
            <button
              type="button"
              onClick={addBlankRow}
              className="rounded-md border border-stone-300 px-3 py-2 text-sm font-bold hover:bg-stone-50"
            >
              新增空记录
            </button>
          </div>

          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm font-semibold text-stone-500">
              上传原图后会按文件名排序生成编辑行；再上传图纸会按相同顺序一一配对。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1180px] w-full border-collapse text-sm">
                <thead className="bg-stone-100 text-left text-xs font-black uppercase text-stone-500">
                  <tr>
                    <th className="w-24 px-3 py-3">原图</th>
                    <th className="w-24 px-3 py-3">图纸</th>
                    <th className="px-3 py-3">基础信息</th>
                    <th className="px-3 py-3">网盘信息</th>
                    <th className="w-24 px-3 py-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-stone-100 align-top">
                      <td className="px-3 py-4">
                        {row.originalImage ? (
                          <button
                            type="button"
                            onClick={() => handleOpenImagePreview(row, 'original', true)}
                            className="block h-20 w-20 overflow-hidden rounded-md border border-transparent bg-stone-50 hover:border-orange-300"
                            aria-label="预览原图"
                          >
                            <img src={row.originalImage} alt={row.title || '原图'} className="h-full w-full object-contain" />
                          </button>
                        ) : (
                          <div className="grid h-20 w-20 place-items-center rounded-md bg-stone-100 text-xs text-stone-400">未上传</div>
                        )}
                        <p className="mt-2 break-all text-xs text-stone-500">{row.originalName}</p>
                        <label className="mt-2 block cursor-pointer rounded-md border border-stone-300 px-2 py-1.5 text-center text-xs font-bold hover:bg-stone-50">
                          替换原图
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => handleSingleImageChange(event, row.id, 'original')}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleOpenWatermarkEditor(row)}
                          disabled={!row.originalImage}
                          className="mt-2 w-full rounded-md border border-amber-200 px-2 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          原图去水印
                        </button>
                      </td>
                      <td className="px-3 py-4">
                        {row.patternPreviewImage ? (
                          <button
                            type="button"
                            onClick={() => handleOpenImagePreview(row, 'pattern', true)}
                            className="block h-20 w-20 overflow-hidden rounded-md border border-transparent bg-stone-50 hover:border-orange-300"
                            aria-label="预览图纸"
                          >
                            <img src={row.patternPreviewImage} alt={`${row.title || '图纸'}预览`} className="h-full w-full object-contain" />
                          </button>
                        ) : (
                          <div className="grid h-20 w-20 place-items-center rounded-md bg-stone-100 text-xs text-stone-400">未上传</div>
                        )}
                        <p className="mt-2 break-all text-xs text-stone-500">{row.patternName}</p>
                        <label className="mt-2 block cursor-pointer rounded-md border border-stone-300 px-2 py-1.5 text-center text-xs font-bold hover:bg-stone-50">
                          替换图纸
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => handleSingleImageChange(event, row.id, 'pattern')}
                            className="hidden"
                          />
                        </label>
                      </td>
                      <td className="space-y-2 px-3 py-4">
                        <input value={row.title} onChange={(event) => updateRow(row.id, { title: event.target.value })} placeholder="标题" className="w-full rounded-md border border-stone-300 px-3 py-2" />
                        <div className="grid grid-cols-3 gap-2">
                          <input value={row.category} onChange={(event) => updateRow(row.id, { category: event.target.value })} placeholder="分类" className="rounded-md border border-stone-300 px-3 py-2" />
                          <input value={row.gridSize} onChange={(event) => updateRow(row.id, { gridSize: event.target.value })} placeholder="尺寸 70x70" className="rounded-md border border-stone-300 px-3 py-2" />
                          <input value={row.colorCount} onChange={(event) => updateRow(row.id, { colorCount: event.target.value })} placeholder="颜色数" inputMode="numeric" className="rounded-md border border-stone-300 px-3 py-2" />
                        </div>
                        <input value={row.id} onChange={(event) => updateRow(row.id, { id: normalizeId(event.target.value) })} placeholder="唯一 ID" className="w-full rounded-md border border-stone-300 px-3 py-2 text-xs text-stone-600" />
                        <textarea value={row.description} onChange={(event) => updateRow(row.id, { description: event.target.value })} placeholder="描述" className="min-h-16 w-full rounded-md border border-stone-300 px-3 py-2" />
                      </td>
                      <td className="space-y-2 px-3 py-4">
                        <input value={row.cloudDriveLabel} onChange={(event) => updateRow(row.id, { cloudDriveLabel: event.target.value })} placeholder="网盘名称" className="w-full rounded-md border border-stone-300 px-3 py-2" />
                        <input value={row.cloudDriveUrl} onChange={(event) => updateRow(row.id, { cloudDriveUrl: event.target.value })} placeholder="网盘链接" className="w-full rounded-md border border-stone-300 px-3 py-2" />
                        <input value={row.cloudDrivePassword} onChange={(event) => updateRow(row.id, { cloudDrivePassword: event.target.value })} placeholder="口令/提取码" className="w-full rounded-md border border-stone-300 px-3 py-2" />
                        <textarea value={row.cloudDriveText} onChange={(event) => updateRow(row.id, { cloudDriveText: event.target.value })} placeholder="完整复制文案" className="min-h-20 w-full rounded-md border border-stone-300 px-3 py-2" />
                      </td>
                      <td className="px-3 py-4">
                        <button type="button" onClick={() => removeDraftRow(row.id)} className="rounded-md border border-red-200 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50">
                          移除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-stone-200 p-4">
            <div>
              <h2 className="text-lg font-black">广场全部图纸</h2>
              <p className="mt-1 text-sm font-semibold text-stone-500">
                这里按广场展示顺序反向列出全部图纸；编辑静态图纸会保存为本地覆盖记录。
              </p>
            </div>
            <button type="button" onClick={handleClearSaved} disabled={savedRows.length === 0} className="rounded-md border border-red-200 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">
              清空本地记录
            </button>
          </div>
          {allGalleryRows.length === 0 ? (
            <div className="p-8 text-center text-sm font-semibold text-stone-500">暂无广场记录。</div>
          ) : (
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {allGalleryRows.map((row) => {
                const hasLocalRecord = savedRows.some((savedRow) => savedRow.id === row.id);

                return (
                <article key={row.id} className="rounded-lg border border-stone-200 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenImagePreview(row, 'original')}
                      className="h-28 overflow-hidden rounded-md border border-transparent bg-stone-50 hover:border-orange-300"
                      aria-label={`预览 ${row.title} 原图`}
                    >
                      <img src={row.originalImage} alt={row.title} className="h-full w-full object-contain" />
                    </button>
                    {row.patternPreviewImage ? (
                      <button
                        type="button"
                        onClick={() => handleOpenImagePreview(row, 'pattern')}
                        className="h-28 overflow-hidden rounded-md border border-transparent bg-stone-50 hover:border-orange-300"
                        aria-label={`预览 ${row.title} 图纸`}
                      >
                        <img src={row.patternPreviewImage} alt={`${row.title} 图纸`} className="h-full w-full object-contain" />
                      </button>
                    ) : (
                      <div className="grid h-28 place-items-center rounded-md bg-stone-100 text-xs text-stone-400">无图纸</div>
                    )}
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-2">
                    <h3 className="min-w-0 truncate font-black">{row.title}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-black ${
                      hasLocalRecord ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'
                    }`}>
                      {hasLocalRecord ? '本地' : '静态'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-stone-500">{row.category} · {row.gridSize}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-stone-400">{row.cloudDriveLabel || '网盘'} · {row.cloudDriveUrl || '未填写'}</p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => handleEditSaved(row)} className="flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm font-bold hover:bg-stone-50">
                      编辑
                    </button>
                    <button type="button" onClick={() => handleOpenWatermarkEditor(row)} className="flex-1 rounded-md border border-amber-200 px-3 py-2 text-sm font-bold text-amber-700 hover:bg-amber-50">
                      去水印
                    </button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteSaved(row.id)}
                      disabled={!hasLocalRecord}
                      className="w-full rounded-md border border-red-200 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {hasLocalRecord ? '删除本地' : '不可删除'}
                    </button>
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </section>
      </section>

      {watermarkEditor && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="watermark-editor-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !watermarkEditor.isProcessing) {
              setWatermarkEditor(null);
            }
          }}
        >
          <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-lg bg-white shadow-2xl sm:max-w-5xl sm:rounded-lg">
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
              <div>
                <h2 id="watermark-editor-title" className="text-xl font-black text-stone-950">
                  原图去水印
                </h2>
                <p className="mt-1 text-sm font-semibold text-stone-500">
                  {watermarkEditor.title} · 调整黄色区域覆盖水印后应用
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWatermarkEditor(null)}
                disabled={watermarkEditor.isProcessing}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-stone-200 text-2xl leading-none text-stone-500 hover:bg-stone-50 disabled:opacity-50"
                aria-label="关闭去水印弹窗"
              >
                ×
              </button>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-center">
                <div ref={watermarkPreviewRef} className="relative inline-block max-h-[68vh] max-w-full overflow-hidden">
                  <img
                    src={watermarkEditor.imageSrc}
                    alt={watermarkEditor.title}
                    className="block max-h-[68vh] max-w-full object-contain"
                  />
                  <div
                    className="absolute cursor-move touch-none border-2 border-amber-400 bg-amber-300/25 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]"
                    role="button"
                    tabIndex={0}
                    aria-label="拖动调整去水印选区"
                    onPointerDown={handleWatermarkSelectionPointerDown}
                    onPointerMove={handleWatermarkSelectionPointerMove}
                    onPointerUp={handleWatermarkSelectionPointerUp}
                    onPointerCancel={handleWatermarkSelectionPointerUp}
                    style={{
                      left: `${watermarkEditor.selection.x}%`,
                      top: `${watermarkEditor.selection.y}%`,
                      width: `${watermarkEditor.selection.width}%`,
                      height: `${watermarkEditor.selection.height}%`,
                    }}
                  >
                    {watermarkResizeHandles.map((resizeHandle) => (
                      <div
                        key={resizeHandle.handle}
                        role="button"
                        tabIndex={0}
                        aria-label={resizeHandle.label}
                        onPointerDown={(event) => handleWatermarkResizePointerDown(resizeHandle.handle, event)}
                        onPointerMove={handleWatermarkSelectionPointerMove}
                        onPointerUp={handleWatermarkSelectionPointerUp}
                        onPointerCancel={handleWatermarkSelectionPointerUp}
                        className={`absolute h-4 w-4 rounded-full border-2 border-white bg-amber-500 shadow ${resizeHandle.className}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <aside className="space-y-4">
                <div className="rounded-lg border border-stone-200 p-4">
                  <h3 className="text-sm font-black text-stone-900">常用位置</h3>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      { label: '右下贴边', selection: { x: 70, y: 84, width: 30, height: 16 } },
                      { label: '左下贴边', selection: { x: 0, y: 84, width: 30, height: 16 } },
                      { label: '底部整条', selection: { x: 0, y: 84, width: 100, height: 16 } },
                      { label: '右上角', selection: { x: 70, y: 0, width: 30, height: 16 } },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => updateWatermarkSelection(preset.selection)}
                        className="rounded-md border border-stone-300 px-3 py-2 text-sm font-bold hover:bg-stone-50"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-stone-200 p-4">
                  <h3 className="text-sm font-black text-stone-900">选区调整</h3>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-stone-600">
                    <div className="rounded-md bg-stone-100 px-3 py-2">
                      位置 {Math.round(watermarkEditor.selection.x)}%, {Math.round(watermarkEditor.selection.y)}%
                    </div>
                    <div className="rounded-md bg-stone-100 px-3 py-2">
                      大小 {Math.round(watermarkEditor.selection.width)}% × {Math.round(watermarkEditor.selection.height)}%
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-6 text-stone-500">
                    拖动黄色区域移动选区；拖动四角或边缘圆点调整宽高。
                  </p>
                </div>

                <div className="rounded-lg bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-800">
                  当前为本地处理：会用选区周边背景颜色覆盖水印。适合白底、浅色背景、边角水印；如果选区覆盖主体内容，也会被一起覆盖。
                </div>

                <button
                  type="button"
                  onClick={handleApplyWatermarkRemoval}
                  disabled={watermarkEditor.isProcessing}
                  className="min-h-11 w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-black text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {watermarkEditor.isProcessing ? '处理中...' : '应用去水印到原图'}
                </button>
              </aside>
            </div>
          </div>
        </div>
      )}

      {imagePreview && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="image-preview-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && saveState !== 'saving') {
              setImagePreview(null);
            }
          }}
        >
          <div className="max-h-[94vh] w-full overflow-hidden rounded-t-lg bg-white shadow-2xl sm:max-w-6xl sm:rounded-lg">
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
              <div>
                <h2 id="image-preview-title" className="text-xl font-black text-stone-950">
                  图片预览
                </h2>
                <p className="mt-1 text-sm font-semibold text-stone-500">
                  {imagePreview.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImagePreview(null)}
                disabled={saveState === 'saving'}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-stone-200 text-2xl leading-none text-stone-500 hover:bg-stone-50 disabled:opacity-50"
                aria-label="关闭图片预览"
              >
                ×
              </button>
            </div>

            <div className="max-h-[calc(94vh-150px)] overflow-auto bg-stone-100 p-4 text-center">
              <img
                src={imagePreview.imageSrc}
                alt={imagePreview.title}
                className="mx-auto max-h-[calc(94vh-190px)] max-w-full rounded-md bg-white object-contain shadow-sm"
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-stone-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-stone-500">
                {imagePreview.canSave
                  ? '确认效果没问题后，可以直接保存当前记录到广场。'
                  : '当前为广场已保存图片预览，如需修改请先点编辑。'}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setImagePreview(null)}
                  disabled={saveState === 'saving'}
                  className="min-h-11 rounded-md border border-stone-300 px-4 py-2 text-sm font-bold hover:bg-stone-50 disabled:opacity-50"
                >
                  关闭
                </button>
                <button
                  type="button"
                  onClick={handleSavePreviewRow}
                  disabled={!imagePreview.canSave || saveState === 'saving'}
                  className="min-h-11 rounded-md bg-orange-500 px-4 py-2 text-sm font-black text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saveState === 'saving' ? '保存中...' : '确认保存到广场'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
