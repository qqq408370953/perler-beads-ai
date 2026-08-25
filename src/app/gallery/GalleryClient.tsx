'use client';

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { GalleryPattern, galleryPatterns } from '../../data/galleryPatterns';
import { getLocalGalleryPatterns, LOCAL_GALLERY_UPDATED_EVENT } from '../../utils/galleryLocalStore';

type CopyState = 'idle' | 'copied' | 'failed';

const allCategory = '全部';

function getCategories(patterns: GalleryPattern[]) {
  return [allCategory, ...Array.from(new Set(patterns.map((item) => item.category)))];
}

function copyWithFallback(text: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const successful = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!successful) {
    throw new Error('copy failed');
  }

  return Promise.resolve();
}

export default function GalleryClient() {
  const [activeCategory, setActiveCategory] = useState(allCategory);
  const [selectedPattern, setSelectedPattern] = useState<GalleryPattern | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [localPatterns, setLocalPatterns] = useState<GalleryPattern[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadLocalPatterns = async () => {
      const records = await getLocalGalleryPatterns();
      if (isMounted) {
        setLocalPatterns(records);
      }
    };

    loadLocalPatterns();
    window.addEventListener(LOCAL_GALLERY_UPDATED_EVENT, loadLocalPatterns);

    return () => {
      isMounted = false;
      window.removeEventListener(LOCAL_GALLERY_UPDATED_EVENT, loadLocalPatterns);
    };
  }, []);

  const allPatterns = useMemo(() => {
    const localById = new Map(localPatterns.map((pattern) => [pattern.id, pattern]));
    const staticIds = new Set(galleryPatterns.map((pattern) => pattern.id));
    const overriddenStaticPatterns = galleryPatterns.map((pattern) => localById.get(pattern.id) ?? pattern);
    const localOnlyPatterns = localPatterns.filter((pattern) => !staticIds.has(pattern.id));

    return [...localOnlyPatterns, ...overriddenStaticPatterns];
  }, [localPatterns]);
  const categories = useMemo(() => getCategories(allPatterns), [allPatterns]);
  const visiblePatterns = useMemo(() => {
    if (activeCategory === allCategory) return allPatterns;
    return allPatterns.filter((item) => item.category === activeCategory);
  }, [activeCategory, allPatterns]);

  const closeModal = () => {
    setSelectedPattern(null);
    setCopyState('idle');
  };

  const handleCopy = async () => {
    if (!selectedPattern) return;

    try {
      await copyWithFallback(
        selectedPattern.cloudDriveText ??
        [
          selectedPattern.cloudDriveUrl,
          selectedPattern.cloudDrivePassword ? `口令/提取码：${selectedPattern.cloudDrivePassword}` : '',
        ].filter(Boolean).join('\n')
      );
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <main className="min-h-screen bg-[#fbfaf6] text-stone-950">
      <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-[#fffdf8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="group flex min-w-0 items-center gap-3" aria-label="返回拼豆AI生成首页">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-pink-200 bg-pink-50 text-lg font-black text-pink-600 shadow-sm">
              拼
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-black">拼豆AI生成</span>
              <span className="block truncate text-xs font-semibold text-stone-500 group-hover:text-stone-700">
                返回工具
              </span>
            </span>
          </Link>

          <nav className="flex items-center gap-2 rounded-full border border-stone-200 bg-white p-1 shadow-sm">
            <Link
              href="/"
              className="rounded-full px-4 py-2 text-sm font-bold text-stone-600 hover:bg-stone-100"
            >
              工具
            </Link>
            <span className="rounded-full bg-orange-500 px-4 py-2 text-sm font-black text-white shadow-sm">
              广场
            </span>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-normal text-stone-900 sm:text-4xl">图纸广场</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              点击图片查看图纸缩略图和网盘链接，复制后去网盘下载保存使用。
            </p>
          </div>
          <div className="rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">
            共 {allPatterns.length} 张图纸
          </div>
        </div>

        <div className="mb-8 flex gap-3 overflow-x-auto pb-2">
          {categories.map((category) => {
            const count =
              category === allCategory
                ? allPatterns.length
                : allPatterns.filter((item) => item.category === category).length;
            const isActive = activeCategory === category;

            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`shrink-0 rounded-full border px-5 py-2.5 text-sm font-black shadow-sm transition ${
                  isActive
                    ? 'border-orange-500 bg-orange-500 text-white'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-orange-200 hover:bg-orange-50'
                }`}
              >
                {category} <span className={isActive ? 'text-orange-100' : 'text-stone-400'}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visiblePatterns.map((pattern) => (
            <button
              key={pattern.id}
              type="button"
              onClick={() => {
                setSelectedPattern(pattern);
                setCopyState('idle');
              }}
              className="group overflow-hidden rounded-lg border border-stone-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <div className="grid aspect-square place-items-center bg-stone-50 p-7">
                <img
                  src={pattern.originalImage}
                  alt={pattern.title}
                  className="max-h-full max-w-full object-contain transition duration-300 group-hover:scale-105"
                />
              </div>
              <div className="space-y-3 border-t border-stone-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-black text-stone-900">{pattern.title}</h2>
                    <p className="mt-1 text-sm font-semibold text-stone-500">
                      {pattern.gridSize} · {pattern.colorCount} 色
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-700">
                    免费图纸
                  </span>
                </div>
                <div className="text-sm font-semibold text-stone-500">{pattern.category}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {selectedPattern && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gallery-modal-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-lg bg-white shadow-2xl sm:max-w-3xl sm:rounded-lg">
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
              <div className="min-w-0">
                <h2 id="gallery-modal-title" className="truncate text-xl font-black text-stone-950">
                  {selectedPattern.title}
                </h2>
                <p className="mt-1 text-sm font-semibold text-stone-500">
                  {selectedPattern.gridSize} · {selectedPattern.colorCount} 色 · {selectedPattern.category}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-stone-200 text-2xl leading-none text-stone-500 hover:bg-stone-50"
                aria-label="关闭弹框"
              >
                ×
              </button>
            </div>

            <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_280px]">
              <section>
                <h3 className="text-sm font-black text-stone-900">图纸缩略图预览</h3>
                <div className="mt-3 grid min-h-72 place-items-center rounded-lg border border-stone-200 bg-stone-50 p-4">
                  {selectedPattern.patternPreviewImage ? (
                    <img
                      src={selectedPattern.patternPreviewImage}
                      alt={`${selectedPattern.title} 图纸缩略图`}
                      className="max-h-[420px] max-w-full object-contain"
                    />
                  ) : (
                    <div className="text-center">
                      <img
                        src={selectedPattern.originalImage}
                        alt={selectedPattern.title}
                        className="mx-auto max-h-48 max-w-full object-contain opacity-80"
                      />
                      <p className="mt-4 text-sm font-semibold text-stone-500">这条记录还没有配置图纸缩略图。</p>
                    </div>
                  )}
                </div>
              </section>

              <aside className="space-y-4">
                <div className="rounded-lg border border-stone-200 bg-[#fffdf8] p-4">
                  <h3 className="text-sm font-black text-stone-900">网盘链接</h3>
                  <div className="mt-2 rounded-md border border-stone-200 bg-white p-3 text-sm leading-6 text-stone-700">
                    <p className="font-black text-stone-900">{selectedPattern.cloudDriveLabel ?? '网盘'}</p>
                    {selectedPattern.cloudDriveText ? (
                      <pre className="mt-2 whitespace-pre-wrap break-all font-sans text-sm leading-6 text-stone-700">
                        {selectedPattern.cloudDriveText}
                      </pre>
                    ) : (
                      <div className="mt-2 space-y-1">
                        <p className="break-all">{selectedPattern.cloudDriveUrl}</p>
                        {selectedPattern.cloudDrivePassword && (
                          <p className="font-semibold">口令/提取码：{selectedPattern.cloudDrivePassword}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="mt-3 min-h-11 w-full rounded-md bg-stone-950 px-4 py-2.5 text-sm font-black text-white hover:bg-stone-800"
                  >
                    {copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败，请手动复制' : '复制口令和链接'}
                  </button>
                  <a
                    href={selectedPattern.cloudDriveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex min-h-11 w-full items-center justify-center rounded-md border border-stone-300 px-4 py-2.5 text-sm font-black text-stone-800 hover:bg-white"
                  >
                    打开网盘
                  </a>
                </div>

                {selectedPattern.description && (
                  <p className="rounded-lg bg-teal-50 p-4 text-sm font-semibold leading-6 text-teal-800">
                    {selectedPattern.description}
                  </p>
                )}
              </aside>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
