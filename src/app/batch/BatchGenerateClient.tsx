'use client';

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import BatchPatternSettings from '../../components/BatchPatternSettings';
import { GridDownloadOptions } from '../../types/downloadTypes';
import {
  downloadImage,
  generateDownloadImagePreview,
  releaseDownloadImagePreviewUrl,
  saveImageBlob,
} from '../../utils/imageDownloader';
import {
  buildDefaultBeadPalette,
  DEFAULT_PATTERN_GENERATION_OPTIONS,
  generatePatternFromImage,
  normalizePatternGenerationOptions,
  PatternGenerationOptions,
  PatternGenerationResult,
  renderPatternThumbnailUrl,
} from '../../utils/patternGenerator';
import { saveSingleToolHandoff } from '../../utils/singleToolHandoff';
import {
  clearBatchSession,
  loadBatchSession,
  saveBatchSession,
  StoredBatchItem,
  StoredBatchStatus,
} from '../../utils/batchSessionStore';

type BatchStatus = StoredBatchStatus;

interface BatchItem {
  id: string;
  fileName: string;
  sourceUrl: string;
  sourceDataUrl: string;
  options: PatternGenerationOptions;
  status: BatchStatus;
  error?: string;
  result?: PatternGenerationResult;
  thumbnailUrl?: string;
}

interface PatternPreviewState {
  itemId: string;
  title: string;
  imageUrl: string;
  blob: Blob;
  filename: string;
}

const defaultDownloadOptions: GridDownloadOptions = {
  showGrid: true,
  gridInterval: 10,
  showCoordinates: true,
  showCellNumbers: true,
  gridLineColor: '#000000',
  includeStats: true,
  exportCsv: false,
  includeSocialPreview: false,
};

function makeItemId() {
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function naturalSortFiles(files: File[]) {
  return files.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }));
}

function revokeUrl(url?: string) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

function serializeBatchItems(items: BatchItem[]): StoredBatchItem[] {
  return items.map((item) => ({
    id: item.id,
    fileName: item.fileName,
    sourceDataUrl: item.sourceDataUrl,
    options: normalizeGenerationOptions(item.options),
    status: item.status === 'processing' ? 'pending' : item.status,
    error: item.status === 'processing' ? undefined : item.error,
    result: item.result,
  }));
}

function normalizeGenerationOptions(options: PatternGenerationOptions): PatternGenerationOptions {
  return normalizePatternGenerationOptions(options);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('图片读取失败'));
      }
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

export default function BatchGenerateClient() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [globalOptions, setGlobalOptions] = useState<PatternGenerationOptions>(() => ({
    ...DEFAULT_PATTERN_GENERATION_OPTIONS,
  }));
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [preview, setPreview] = useState<PatternPreviewState | null>(null);
  const itemsRef = useRef<BatchItem[]>([]);
  const previewRef = useRef<PatternPreviewState | null>(null);

  const summary = useMemo(() => {
    const done = items.filter((item) => item.status === 'done').length;
    const failed = items.filter((item) => item.status === 'failed').length;
    const processing = items.filter((item) => item.status === 'processing').length;

    return { done, failed, processing, total: items.length };
  }, [items]);
  const isBusy = isGeneratingAll || summary.processing > 0;

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const session = await loadBatchSession();
        if (!session || cancelled) return;

        const restoredItems = await Promise.all(session.items.map(async (storedItem): Promise<BatchItem> => {
          const restoredItem: BatchItem = {
            ...storedItem,
            sourceUrl: storedItem.sourceDataUrl,
            options: normalizeGenerationOptions(storedItem.options),
            status: storedItem.status === 'processing' ? 'pending' : storedItem.status,
            error: storedItem.status === 'processing' ? undefined : storedItem.error,
          };

          if (storedItem.result) {
            try {
              restoredItem.thumbnailUrl = await renderPatternThumbnailUrl(storedItem.result);
            } catch (error) {
              console.warn(`恢复 ${storedItem.fileName} 缩略图失败:`, error);
            }
          }

          return restoredItem;
        }));

        if (cancelled) {
          restoredItems.forEach((item) => revokeUrl(item.thumbnailUrl));
          return;
        }

        setGlobalOptions(normalizeGenerationOptions(session.globalOptions));
        setItems(restoredItems);
      } catch (error) {
        console.error('恢复批量会话失败:', error);
      } finally {
        if (!cancelled) {
          setIsSessionReady(true);
        }
      }
    };

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSessionReady) return;

    const timeoutId = window.setTimeout(() => {
      saveBatchSession({
        items: serializeBatchItems(items),
        globalOptions,
      }).catch((error) => {
        console.error('保存批量会话失败:', error);
      });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [globalOptions, isSessionReady, items]);

  useEffect(() => (
    () => {
      itemsRef.current.forEach((item) => {
        revokeUrl(item.sourceUrl);
        revokeUrl(item.thumbnailUrl);
      });
      releaseDownloadImagePreviewUrl(previewRef.current?.imageUrl);
    }
  ), []);

  const updateItem = (id: string, patch: Partial<BatchItem>) => {
    setItems((currentItems) => currentItems.map((item) => (
      item.id === id ? { ...item, ...patch } : item
    )));
  };

  const updateItemOptions = (id: string, patch: Partial<PatternGenerationOptions>) => {
    setItems((currentItems) => currentItems.map((item) => (
      item.id === id
        ? {
          ...item,
          options: normalizeGenerationOptions({ ...item.options, ...patch }),
          status: item.status === 'processing' ? item.status : 'pending',
          error: undefined,
        }
        : item
    )));
  };

  const handleFilesChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = naturalSortFiles(Array.from(event.target.files ?? [])).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) return;

    const nextItems = await Promise.all(files.map(async (file) => ({
      id: makeItemId(),
      fileName: file.name,
      sourceUrl: URL.createObjectURL(file),
      sourceDataUrl: await readFileAsDataUrl(file),
      options: normalizeGenerationOptions(globalOptions),
      status: 'pending' as const,
    })));

    setItems((currentItems) => [...nextItems, ...currentItems]);
    event.target.value = '';
  };

  const applyGlobalOptionsToAll = () => {
    setItems((currentItems) => currentItems.map((item) => ({
      ...item,
      options: normalizeGenerationOptions(globalOptions),
      status: item.status === 'processing' ? item.status : 'pending',
      error: undefined,
    })));
  };

  const removeItem = (id: string) => {
    setItems((currentItems) => {
      const item = currentItems.find((currentItem) => currentItem.id === id);
      revokeUrl(item?.sourceUrl);
      revokeUrl(item?.thumbnailUrl);
      return currentItems.filter((currentItem) => currentItem.id !== id);
    });
  };

  const clearItems = () => {
    items.forEach((item) => {
      revokeUrl(item.sourceUrl);
      revokeUrl(item.thumbnailUrl);
    });
    setItems([]);
    clearBatchSession().catch((error) => {
      console.error('清空批量会话失败:', error);
    });
  };

  const runGeneration = async (item: BatchItem) => {
    const generationOptions = normalizeGenerationOptions(item.options);
    updateItem(item.id, { status: 'processing', error: undefined, options: generationOptions });

    try {
      const result = await generatePatternFromImage(item.sourceUrl, generationOptions);
      const thumbnailUrl = await renderPatternThumbnailUrl(result);

      setItems((currentItems) => currentItems.map((currentItem) => {
        if (currentItem.id !== item.id) return currentItem;
        revokeUrl(currentItem.thumbnailUrl);
        return {
          ...currentItem,
          options: generationOptions,
          status: 'done',
          result,
          thumbnailUrl,
          error: undefined,
        };
      }));
    } catch (error) {
      updateItem(item.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : '生成失败',
      });
    }
  };

  const generateOne = async (id: string) => {
    const item = items.find((currentItem) => currentItem.id === id);
    if (!item || item.status === 'processing') return;
    await runGeneration(item);
  };

  const generateAll = async () => {
    if (isBusy) return;

    setIsGeneratingAll(true);
    try {
      const queue = items.filter((item) => item.status !== 'processing');
      for (const item of queue) {
        await runGeneration(item);
      }
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const openFinalPreview = async (item: BatchItem) => {
    if (!item.result) return;

    const finalPreview = await generateDownloadImagePreview({
      mappedPixelData: item.result.mappedPixelData,
      gridDimensions: item.result.gridDimensions,
      colorCounts: item.result.colorCounts,
      totalBeadCount: item.result.totalBeadCount,
      options: defaultDownloadOptions,
      activeBeadPalette: buildDefaultBeadPalette(item.options.selectedColorSystem),
      selectedColorSystem: item.options.selectedColorSystem,
    });

    if (!finalPreview) return;

    setPreview((currentPreview) => {
      releaseDownloadImagePreviewUrl(currentPreview?.imageUrl);
      return {
        itemId: item.id,
        title: item.fileName,
        imageUrl: finalPreview.imageUrl,
        blob: finalPreview.blob,
        filename: finalPreview.filename,
      };
    });
  };

  const downloadOne = async (item: BatchItem) => {
    if (!item.result) return;

    await downloadImage({
      mappedPixelData: item.result.mappedPixelData,
      gridDimensions: item.result.gridDimensions,
      colorCounts: item.result.colorCounts,
      totalBeadCount: item.result.totalBeadCount,
      options: defaultDownloadOptions,
      activeBeadPalette: buildDefaultBeadPalette(item.options.selectedColorSystem),
      selectedColorSystem: item.options.selectedColorSystem,
    });
  };

  const downloadAll = async () => {
    const doneItems = items.filter((item) => item.status === 'done' && item.result);
    for (const item of doneItems) {
      await downloadOne(item);
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  };

  const openInSingleTool = async (item: BatchItem) => {
    if (!item.result) return;

    try {
      await saveBatchSession({
        items: serializeBatchItems(itemsRef.current),
        globalOptions: normalizeGenerationOptions(globalOptions),
        activeItemId: item.id,
      });

      saveSingleToolHandoff({
        sourceImageSrc: item.sourceDataUrl,
        fileName: item.fileName,
        options: normalizeGenerationOptions(item.options),
        result: item.result,
        batchContext: {
          itemId: item.id,
        },
      });

      window.location.href = '/';
    } catch (error) {
      console.error('进入单图精修前保存批量会话失败:', error);
      alert('保存批量任务失败，请稍后再试，避免返回后数据丢失。');
    }
  };

  const closePreview = () => {
    setPreview((currentPreview) => {
      releaseDownloadImagePreviewUrl(currentPreview?.imageUrl);
      return null;
    });
  };

  const updateGlobalOptions = (patch: Partial<PatternGenerationOptions>) => {
    setGlobalOptions((currentOptions) => normalizeGenerationOptions({
      ...currentOptions,
      ...patch,
    }));
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-base font-black text-slate-950">
            批量生成拼豆图纸
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-bold hover:bg-slate-100">
              单图工具
            </Link>
            <Link href="/gallery" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
              图纸广场
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <label className={`grid min-h-36 place-items-center rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-center ${
                isBusy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-sky-400 hover:bg-sky-50'
              }`}>
                <span>
                  <span className="block text-lg font-black text-slate-950">批量上传原图</span>
                  <span className="mt-2 block text-sm font-semibold text-slate-500">
                    可一次选择多张 JPG/PNG 图片，按文件名自然排序加入队列。
                  </span>
                </span>
                <input type="file" accept="image/*" multiple onChange={handleFilesChange} disabled={isBusy} className="hidden" />
              </label>

              <div className="grid grid-cols-4 gap-3 rounded-md border border-slate-200 p-4 text-center">
                <div>
                  <div className="text-2xl font-black">{summary.total}</div>
                  <div className="text-xs font-bold text-slate-500">总数</div>
                </div>
                <div>
                  <div className="text-2xl font-black">{summary.processing}</div>
                  <div className="text-xs font-bold text-slate-500">生成中</div>
                </div>
                <div>
                  <div className="text-2xl font-black">{summary.done}</div>
                  <div className="text-xs font-bold text-slate-500">已完成</div>
                </div>
                <div>
                  <div className="text-2xl font-black">{summary.failed}</div>
                  <div className="text-xs font-bold text-slate-500">失败</div>
                </div>
              </div>
            </div>
          </section>

          <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black text-slate-950">全局参数</h2>
            <div className="mt-3">
              <BatchPatternSettings
                options={globalOptions}
                disabled={isBusy}
                onChange={updateGlobalOptions}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={applyGlobalOptionsToAll}
                disabled={items.length === 0 || isBusy}
                className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                应用到全部
              </button>
              <button
                type="button"
                onClick={generateAll}
                disabled={items.length === 0 || isBusy}
                className="min-h-11 rounded-md bg-sky-600 px-3 py-2 text-sm font-black text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGeneratingAll ? '生成中...' : '批量生成'}
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={downloadAll}
                disabled={summary.done === 0 || isBusy}
                className="min-h-11 rounded-md bg-emerald-600 px-3 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                下载全部
              </button>
              <button
                type="button"
                onClick={clearItems}
                disabled={items.length === 0 || isBusy}
                className="min-h-11 rounded-md border border-red-200 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                清空
              </button>
            </div>
          </aside>
        </div>

        {items.length === 0 ? (
          <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 shadow-sm">
            上传图片后会生成批量任务。每张图片都可以独立调整参数并重新生成。
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-slate-100 p-2">
                    <img src={item.sourceUrl} alt={item.fileName} className="h-40 w-full object-contain" />
                  </div>
                  <div className="grid h-44 place-items-center rounded-md bg-slate-100 p-2">
                    {item.status === 'processing' ? (
                      <div className="text-sm font-black text-sky-700">生成中...</div>
                    ) : item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={`${item.fileName} 图纸预览`} className="max-h-40 max-w-full object-contain" />
                    ) : item.status === 'failed' ? (
                      <div className="px-3 text-center text-sm font-bold text-red-600">{item.error}</div>
                    ) : (
                      <div className="text-sm font-bold text-slate-400">待生成</div>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-start justify-between gap-2">
                  <h3 className="min-w-0 truncate text-base font-black">{item.fileName}</h3>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-black ${
                    item.status === 'done'
                      ? 'bg-emerald-50 text-emerald-700'
                      : item.status === 'failed'
                        ? 'bg-red-50 text-red-700'
                        : item.status === 'processing'
                          ? 'bg-sky-50 text-sky-700'
                          : 'bg-slate-100 text-slate-500'
                  }`}>
                    {item.status === 'done' ? '已完成' : item.status === 'failed' ? '失败' : item.status === 'processing' ? '生成中' : '待生成'}
                  </span>
                </div>

                {item.result && (
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {item.result.gridDimensions.N}x{item.result.gridDimensions.M} · {item.result.colorCount} 色 · {item.result.totalBeadCount} 颗
                  </p>
                )}

                <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50">
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm font-black text-slate-700">
                    调整本图参数 · {item.options.granularity} 格 · {item.options.maxColorCount} 色
                  </summary>
                  <div className="border-t border-slate-200 bg-white p-3">
                    <BatchPatternSettings
                      options={item.options}
                      disabled={isBusy}
                      compact
                      onChange={(patch) => updateItemOptions(item.id, patch)}
                    />
                  </div>
                </details>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => generateOne(item.id)}
                    disabled={isBusy}
                    className="min-h-10 rounded-md bg-sky-600 px-3 py-2 text-sm font-black text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {item.result ? '重新生成' : '生成'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openFinalPreview(item)}
                    disabled={!item.result || isBusy}
                    className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    预览图纸
                  </button>
                  <button
                    type="button"
                    onClick={() => openInSingleTool(item)}
                    disabled={!item.result || isBusy}
                    className="min-h-10 rounded-md bg-amber-500 px-3 py-2 text-sm font-black text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    单图精修
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadOne(item)}
                    disabled={!item.result || isBusy}
                    className="min-h-10 rounded-md bg-emerald-600 px-3 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    下载
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    disabled={isBusy}
                    className="min-h-10 rounded-md border border-red-200 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    删除
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </section>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-preview-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closePreview();
            }
          }}
        >
          <div className="max-h-[94vh] w-full overflow-hidden rounded-t-lg bg-white shadow-2xl sm:max-w-6xl sm:rounded-lg">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="batch-preview-title" className="text-xl font-black">图纸预览</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">{preview.title}</p>
              </div>
              <button
                type="button"
                onClick={closePreview}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-200 text-2xl leading-none text-slate-500 hover:bg-slate-50"
                aria-label="关闭预览"
              >
                ×
              </button>
            </div>
            <div className="max-h-[calc(94vh-150px)] overflow-auto bg-slate-100 p-4 text-center">
              <img src={preview.imageUrl} alt={`${preview.title} 图纸预览`} className="mx-auto max-w-full rounded-md bg-white shadow-sm" />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={closePreview}
                className="min-h-11 rounded-md border border-slate-300 px-4 py-2 text-sm font-bold hover:bg-slate-50"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={() => saveImageBlob(preview.blob, preview.filename)}
                className="min-h-11 rounded-md bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700"
              >
                下载当前预览
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
