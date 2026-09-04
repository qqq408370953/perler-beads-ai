'use client';

/* eslint-disable @next/next/no-img-element */

import { CSSProperties, MouseEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  POSTER_HEIGHT,
  POSTER_WIDTH,
  applyPosterTextStyleToAll,
  buildPosterTextGlyphs,
  buildPosterTextPaintLayers,
  constrainPosterTransform,
  mergePosterLayerTransforms,
  movePosterLayer,
  posterFontOptions,
  posterTextEffectPresets,
  resolvePosterTextStyle,
  updatePosterTextStyleOverride,
  type PosterBaseLayer,
  type PosterLayerTransform,
  type ResolvedPosterTextStyle,
  type PosterTextFillMode,
  type PosterTextStyleOverride,
} from '../utils/posterLayout';
import {
  canStartPosterLayerGesture,
  shouldSuppressPosterPanelActivation,
  type PosterPointerSample,
} from '../utils/posterInteraction';

interface PosterFreeLayoutModalProps {
  isOpen: boolean;
  layers: PosterBaseLayer[];
  initialTransforms: PosterLayerTransform[] | null;
  initialTextStyles: PosterTextStyleOverride[];
  backgroundStart: string;
  backgroundEnd: string;
  useGradientBackground: boolean;
  onClose: () => void;
  onApply: (transforms: PosterLayerTransform[], textStyles: PosterTextStyleOverride[]) => void;
  onReset: () => void;
}

type GestureMode = 'move' | 'scale' | 'rotate' | 'pinch';

interface GestureState {
  mode: GestureMode;
  pointerId: number;
  layerId: string;
  startClientX: number;
  startClientY: number;
  startTransform: PosterLayerTransform;
  startDistance?: number;
  startAngle?: number;
}

const layerNames: Record<PosterBaseLayer['kind'], string> = {
  title: '顶部标题',
  subtitle: '副标题',
  'item-image': '图片',
  'item-label': '图片名称',
  'bottom-title': '底部大标题',
  'fixed-text': '底部小字',
};

function distanceToCenter(event: PointerEvent, transform: PosterLayerTransform, rect: DOMRect) {
  const centerX = rect.left + (transform.x / POSTER_WIDTH) * rect.width;
  const centerY = rect.top + (transform.y / POSTER_HEIGHT) * rect.height;
  return Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY));
}

function angleToCenter(event: PointerEvent, transform: PosterLayerTransform, rect: DOMRect) {
  const centerX = rect.left + (transform.x / POSTER_WIDTH) * rect.width;
  const centerY = rect.top + (transform.y / POSTER_HEIGHT) * rect.height;
  return (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI;
}

function colorInputValue(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function toContainerWidthUnit(value: number) {
  return `${(value / POSTER_WIDTH) * 100}cqw`;
}

function buildDomTextShadow(
  style: ResolvedPosterTextStyle,
  includeExtrusion = true
): string | undefined {
  const shadows: string[] = [];
  if (includeExtrusion) {
    for (let offset = 2; offset <= style.extrusionDepth; offset += 2) {
      shadows.push(`${toContainerWidthUnit(offset * 0.7)} ${toContainerWidthUnit(offset)} 0 ${style.extrusionColor}`);
    }
  }
  if (style.shadow) {
    shadows.push(
      `${toContainerWidthUnit(style.shadow.offsetX)} ${toContainerWidthUnit(style.shadow.offsetY)} ${toContainerWidthUnit(style.shadow.blur)} ${style.shadow.color}`
    );
  }
  return shadows.length ? shadows.join(', ') : undefined;
}

function getSharedTextPaint(
  style: ResolvedPosterTextStyle,
  includeExtrusion = true
): CSSProperties {
  return {
    WebkitTextStroke: style.strokeEnabled
      ? `${toContainerWidthUnit(style.strokeWidth)} ${style.strokeColor}`
      : undefined,
    textShadow: buildDomTextShadow(style, includeExtrusion),
    paintOrder: 'stroke fill',
  };
}

export default function PosterFreeLayoutModal({
  isOpen,
  layers,
  initialTransforms,
  initialTextStyles,
  backgroundStart,
  backgroundEnd,
  useGradientBackground,
  onClose,
  onApply,
  onReset,
}: PosterFreeLayoutModalProps) {
  const posterRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const gestureRef = useRef<GestureState | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const panelPointerStartRef = useRef<{ pointerId: number; sample: PosterPointerSample } | null>(null);
  const suppressPanelClickUntilRef = useRef(0);
  const [transforms, setTransforms] = useState<PosterLayerTransform[]>([]);
  const [textStyles, setTextStyles] = useState<PosterTextStyleOverride[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const initialSnapshotRef = useRef('');

  useEffect(() => {
    if (!isOpen) return;
    const merged = mergePosterLayerTransforms(layers, initialTransforms);
    setTransforms(merged);
    setTextStyles(initialTextStyles);
    setSelectedId(null);
    initialSnapshotRef.current = JSON.stringify({ transforms: merged, textStyles: initialTextStyles });
  }, [isOpen, layers, initialTransforms, initialTextStyles]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedId || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      if (event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      const step = event.shiftKey ? 10 : 2;
      setTransforms((current) =>
        current.map((transform) => {
          if (transform.id !== selectedId) return transform;
          return constrainPosterTransform({
            ...transform,
            x: transform.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
            y: transform.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
          });
        })
      );
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedId]);

  const resolved = useMemo(() => {
    const transformById = new Map(transforms.map((transform) => [transform.id, transform]));
    return layers
      .map((layer) => ({ layer, transform: transformById.get(layer.id) }))
      .filter((entry): entry is { layer: PosterBaseLayer; transform: PosterLayerTransform } => Boolean(entry.transform))
      .sort((a, b) => a.transform.zIndex - b.transform.zIndex);
  }, [layers, transforms]);

  const selected = transforms.find((transform) => transform.id === selectedId) ?? null;
  const selectedLayer = layers.find((layer) => layer.id === selectedId) ?? null;
  const selectedTextStyle = selectedLayer?.textStyle
    ? resolvePosterTextStyle(selectedLayer, textStyles)
    : null;
  const dirty = JSON.stringify({ transforms, textStyles }) !== initialSnapshotRef.current;

  const updateTransform = (id: string, update: (current: PosterLayerTransform) => PosterLayerTransform) => {
    setTransforms((current) =>
      current.map((transform) =>
        transform.id === id ? constrainPosterTransform(update(transform)) : transform
      )
    );
  };

  const updateSelectedTextStyle = (
    patch: Partial<Omit<PosterTextStyleOverride, 'id'>>
  ) => {
    if (!selectedLayer?.textStyle) return;
    setTextStyles((current) => updatePosterTextStyleOverride(current, selectedLayer, patch));
  };

  const requestClose = () => {
    if (dirty && !window.confirm('当前自由布局尚未应用，确定关闭吗？')) return;
    onClose();
  };

  const clearSelection = () => {
    gestureRef.current = null;
    pointersRef.current.clear();
    setSelectedId(null);
  };

  const getPanelPointerSample = (event: PointerEvent<HTMLElement>): PosterPointerSample => ({
    x: event.clientX,
    y: event.clientY,
    scrollTop: panelRef.current?.scrollTop ?? 0,
  });

  const handlePanelPointerDownCapture = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return;
    panelPointerStartRef.current = {
      pointerId: event.pointerId,
      sample: getPanelPointerSample(event),
    };
  };

  const recordPanelScrollIntent = (event: PointerEvent<HTMLElement>) => {
    const start = panelPointerStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    if (shouldSuppressPosterPanelActivation(start.sample, getPanelPointerSample(event))) {
      suppressPanelClickUntilRef.current = Date.now() + 350;
    }
  };

  const finishPanelPointer = (event: PointerEvent<HTMLElement>) => {
    recordPanelScrollIntent(event);
    if (panelPointerStartRef.current?.pointerId === event.pointerId) {
      panelPointerStartRef.current = null;
    }
  };

  const cancelPanelPointer = (event: PointerEvent<HTMLElement>) => {
    if (panelPointerStartRef.current?.pointerId !== event.pointerId) return;
    suppressPanelClickUntilRef.current = Date.now() + 350;
    panelPointerStartRef.current = null;
  };

  const suppressAccidentalPanelClick = (event: MouseEvent<HTMLElement>) => {
    if (Date.now() >= suppressPanelClickUntilRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressPanelClickUntilRef.current = 0;
  };

  const beginGesture = (
    mode: GestureMode,
    layerId: string,
    event: PointerEvent<HTMLElement>
  ) => {
    const transform = transforms.find((item) => item.id === layerId);
    const poster = posterRef.current;
    if (!transform || !poster || !canStartPosterLayerGesture(selectedId, layerId)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const rect = poster.getBoundingClientRect();
    const pointerValues = [...pointersRef.current.values()];
    if (mode === 'move' && pointerValues.length === 2) {
      const [first, second] = pointerValues;
      gestureRef.current = {
        mode: 'pinch',
        pointerId: -1,
        layerId,
        startClientX: (first.x + second.x) / 2,
        startClientY: (first.y + second.y) / 2,
        startTransform: { ...transform },
        startDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        startAngle: (Math.atan2(second.y - first.y, second.x - first.x) * 180) / Math.PI,
      };
      setSelectedId(layerId);
      return;
    }
    gestureRef.current = {
      mode,
      pointerId: event.pointerId,
      layerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startTransform: { ...transform },
      startDistance: mode === 'scale' ? distanceToCenter(event, transform, rect) : undefined,
      startAngle: mode === 'rotate' ? angleToCenter(event, transform, rect) : undefined,
    };
    setSelectedId(layerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    const poster = posterRef.current;
    if (!gesture || !poster || (gesture.mode !== 'pinch' && gesture.pointerId !== event.pointerId)) return;
    event.preventDefault();
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const rect = poster.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    if (gesture.mode === 'pinch') {
      const pointerValues = [...pointersRef.current.values()];
      if (pointerValues.length < 2) return;
      const [first, second] = pointerValues;
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;
      const currentDistance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const currentAngle = (Math.atan2(second.y - first.y, second.x - first.x) * 180) / Math.PI;
      updateTransform(gesture.layerId, () => ({
        ...gesture.startTransform,
        x: gesture.startTransform.x + ((centerX - gesture.startClientX) / rect.width) * POSTER_WIDTH,
        y: gesture.startTransform.y + ((centerY - gesture.startClientY) / rect.height) * POSTER_HEIGHT,
        scale: gesture.startTransform.scale * (currentDistance / (gesture.startDistance ?? 1)),
        rotation: gesture.startTransform.rotation + currentAngle - (gesture.startAngle ?? currentAngle),
      }));
      return;
    }

    if (gesture.mode === 'move') {
      const deltaX = ((event.clientX - gesture.startClientX) / rect.width) * POSTER_WIDTH;
      const deltaY = ((event.clientY - gesture.startClientY) / rect.height) * POSTER_HEIGHT;
      updateTransform(gesture.layerId, () => ({
        ...gesture.startTransform,
        x: gesture.startTransform.x + deltaX,
        y: gesture.startTransform.y + deltaY,
      }));
      return;
    }

    if (gesture.mode === 'scale') {
      const currentDistance = distanceToCenter(event, gesture.startTransform, rect);
      const startDistance = gesture.startDistance ?? 1;
      updateTransform(gesture.layerId, () => ({
        ...gesture.startTransform,
        scale: gesture.startTransform.scale * (currentDistance / startDistance),
      }));
      return;
    }

    const currentAngle = angleToCenter(event, gesture.startTransform, rect);
    updateTransform(gesture.layerId, () => ({
      ...gesture.startTransform,
      rotation: gesture.startTransform.rotation + currentAngle - (gesture.startAngle ?? currentAngle),
    }));
  };

  const endGesture = (event: PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || (gesture.mode !== 'pinch' && gesture.pointerId !== event.pointerId)) return;
    gestureRef.current = null;
    if (gesture.mode === 'pinch') {
      pointersRef.current.clear();
    } else {
      pointersRef.current.delete(event.pointerId);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const resetLayout = () => {
    if (!window.confirm('确定恢复自动布局吗？自由调整的位置、大小、旋转和层级将被清除。')) return;
    const automatic = mergePosterLayerTransforms(layers, null);
    setTransforms(automatic);
    setSelectedId(null);
    onReset();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950" role="dialog" aria-modal="true" aria-labelledby="poster-free-layout-title">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-900 px-3 py-3 text-white sm:px-5">
        <div>
          <h2 id="poster-free-layout-title" className="text-base font-black sm:text-lg">自由布局编辑</h2>
          <p className="text-xs text-slate-400">选中后锁定当前元素；点画布空白完成，再选择其他元素。</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={resetLayout} className="min-h-10 rounded-lg border border-white/20 px-3 text-sm font-bold text-slate-200 hover:bg-white/10">恢复自动布局</button>
          <button type="button" onClick={requestClose} className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-2xl text-slate-200" aria-label="关闭自由布局">×</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="flex shrink-0 items-center justify-center bg-slate-950 p-3 sm:p-6 lg:min-h-0 lg:flex-1 lg:shrink lg:overflow-auto">
          <div
            ref={posterRef}
            className="relative aspect-[3/4] shrink-0 overflow-hidden shadow-2xl"
            style={{
              width: 'min(100%, calc((100dvh - 150px) * 0.75))',
              containerType: 'inline-size',
              background: useGradientBackground
                ? `linear-gradient(90deg, ${backgroundStart}, ${backgroundEnd})`
                : backgroundStart,
            }}
            onPointerDown={clearSelection}
          >
            {resolved.map(({ layer, transform }) => {
              const isSelected = transform.id === selectedId;
              const isLocked = selectedId !== null && !isSelected;
              const textStyle = layer.textStyle
                ? resolvePosterTextStyle(layer, textStyles)
                : null;
              const textGlyphs = layer.text && textStyle?.fillMode === 'characters'
                ? buildPosterTextGlyphs(layer.text, textStyle)
                : null;
              const textPaintLayers = textStyle && textGlyphs
                ? buildPosterTextPaintLayers(textStyle)
                : null;
              return (
                <div
                  key={layer.id}
                  className={`absolute touch-none select-none ${isLocked ? 'pointer-events-none' : ''} ${isSelected ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-transparent' : ''}`}
                  style={{
                    left: `${(transform.x / POSTER_WIDTH) * 100}%`,
                    top: `${(transform.y / POSTER_HEIGHT) * 100}%`,
                    width: `${(layer.width / POSTER_WIDTH) * 100}%`,
                    height: `${(layer.height / POSTER_HEIGHT) * 100}%`,
                    zIndex: transform.zIndex,
                    transform: `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${transform.scale})`,
                    transformOrigin: 'center',
                  }}
                  onPointerDown={(event) => beginGesture('move', layer.id, event)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endGesture}
                  onPointerCancel={endGesture}
                >
                  {layer.imageSrc ? (
                    <img
                      src={layer.imageSrc}
                      alt=""
                      draggable={false}
                      className="pointer-events-none h-full w-full object-contain"
                      style={{ filter: layer.shadow ? 'drop-shadow(10px 14px 8px rgba(35,25,20,.35))' : undefined }}
                    />
                  ) : (
                    <div
                      className="pointer-events-none flex h-full w-full items-center justify-center whitespace-nowrap text-center leading-none"
                      style={{
                        fontFamily: textStyle?.fontFamily,
                        fontWeight: textStyle?.fontWeight,
                        fontSize: `${((layer.textStyle?.fontSize ?? 24) / POSTER_WIDTH) * 100}cqw`,
                        letterSpacing: `${((textStyle?.letterSpacing ?? 0) / POSTER_WIDTH) * 100}cqw`,
                      }}
                    >
                      {textStyle && (
                        <span
                          className="inline-flex items-center justify-center"
                          style={{
                            transform: `skewX(${textStyle.skewX}deg) scale(${textStyle.scaleX}, ${textStyle.scaleY})`,
                            transformOrigin: 'center',
                            color: textStyle.gradient ? 'transparent' : textStyle.fill,
                            backgroundImage: textStyle.gradient
                              ? `linear-gradient(180deg, ${textStyle.gradient.join(', ')})`
                              : undefined,
                            backgroundClip: textStyle.gradient ? 'text' : undefined,
                            WebkitBackgroundClip: textStyle.gradient ? 'text' : undefined,
                            ...(textGlyphs ? {} : getSharedTextPaint(textStyle)),
                          }}
                        >
                          {textGlyphs
                            ? textGlyphs.map((glyph, index) => (
                                <span
                                  key={`${glyph.char}-${index}`}
                                  className="relative inline-block"
                                  style={{
                                    transform: `translateY(${toContainerWidthUnit(glyph.offsetY)}) rotate(${glyph.rotation}deg) scaleY(${glyph.scaleY})`,
                                    transformOrigin: 'center',
                                  }}
                                >
                                  {textPaintLayers?.map((paintLayer) => (
                                    <span
                                      key={paintLayer.role}
                                      aria-hidden={paintLayer.role === 'face' ? undefined : true}
                                      className={paintLayer.role === 'face' ? 'relative z-20 inline-block' : 'absolute inset-0'}
                                      style={paintLayer.role === 'face'
                                        ? {
                                            color: glyph.fill,
                                            WebkitTextFillColor: 'transparent',
                                            WebkitTextStroke: '0 transparent',
                                            backgroundImage: `linear-gradient(180deg, ${glyph.gradient.join(', ')})`,
                                            backgroundClip: 'text',
                                            WebkitBackgroundClip: 'text',
                                          }
                                        : {
                                            color: paintLayer.fill,
                                            WebkitTextFillColor: paintLayer.fill,
                                            WebkitTextStroke: paintLayer.strokeWidth > 0
                                              ? `${toContainerWidthUnit(paintLayer.strokeWidth)} ${paintLayer.strokeColor}`
                                              : undefined,
                                            textShadow: paintLayer.role === 'outline'
                                              ? buildDomTextShadow(textStyle, false)
                                              : undefined,
                                            transform: `translate(${toContainerWidthUnit(paintLayer.offsetX)}, ${toContainerWidthUnit(paintLayer.offsetY)})`,
                                            zIndex: paintLayer.role === 'extrusion' ? 0 : 10,
                                          }}
                                    >
                                      {glyph.char}
                                    </span>
                                  ))}
                                </span>
                              ))
                            : layer.text}
                        </span>
                      )}
                    </div>
                  )}
                  {isSelected && (
                    <>
                      <button
                        type="button"
                        aria-label="旋转元素"
                        className="absolute left-1/2 top-0 grid h-7 w-7 -translate-x-1/2 -translate-y-[150%] place-items-center rounded-full border-2 border-white bg-amber-500 text-sm font-black text-white shadow"
                        onPointerDown={(event) => beginGesture('rotate', layer.id, event)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={endGesture}
                        onPointerCancel={endGesture}
                      >
                        ↻
                      </button>
                      <button
                        type="button"
                        aria-label="缩放元素"
                        className="absolute -bottom-3 -right-3 h-7 w-7 rounded-full border-2 border-white bg-amber-500 shadow"
                        onPointerDown={(event) => beginGesture('scale', layer.id, event)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={endGesture}
                        onPointerCancel={endGesture}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <aside
          ref={panelRef}
          className="max-h-[55dvh] shrink-0 touch-pan-y overflow-y-auto overscroll-y-contain border-t border-white/10 bg-slate-900 p-3 pb-8 text-white lg:max-h-none lg:w-80 lg:border-l lg:border-t-0 lg:p-5"
          onPointerDownCapture={handlePanelPointerDownCapture}
          onPointerMoveCapture={recordPanelScrollIntent}
          onPointerUpCapture={finishPanelPointer}
          onPointerCancelCapture={cancelPanelPointer}
          onClickCapture={suppressAccidentalPanelClick}
        >
          {selected && selectedLayer ? (
            <div className="space-y-4">
              <div className="sticky -top-3 z-30 -mx-3 -mt-3 flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900/95 px-3 py-3 backdrop-blur lg:static lg:mx-0 lg:mt-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-400">当前元素 · 已锁定</div>
                  <div className="mt-1 truncate font-black">{layerNames[selectedLayer.kind]}{selectedLayer.text ? ` · ${selectedLayer.text}` : ''}</div>
                </div>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="min-h-10 shrink-0 touch-manipulation rounded-lg border border-amber-400/60 px-3 text-xs font-black text-amber-300 hover:bg-amber-400/10"
                >
                  完成当前元素
                </button>
              </div>
              <label className="block text-xs font-bold text-slate-300">
                大小 {selected.scale.toFixed(2)} 倍
                <input type="range" min="0.2" max="4" step="0.05" value={selected.scale} onChange={(event) => updateTransform(selected.id, (current) => ({ ...current, scale: Number(event.target.value) }))} className="mt-2 w-full accent-amber-500" />
              </label>
              <label className="block text-xs font-bold text-slate-300">
                旋转 {Math.round(selected.rotation)}°
                <input type="range" min="0" max="359" step="1" value={selected.rotation} onChange={(event) => updateTransform(selected.id, (current) => ({ ...current, rotation: Number(event.target.value) }))} className="mt-2 w-full accent-amber-500" />
              </label>
              {selectedTextStyle && (
                <div className="space-y-3 border-t border-white/10 pt-4">
                  <div>
                    <div className="text-sm font-black">文字样式</div>
                    <div className="mt-0.5 text-xs text-slate-400">以下调整默认只作用于当前文字</div>
                  </div>

                  <div>
                    <div className="text-xs font-bold text-slate-300">艺术字</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {posterTextEffectPresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => updateSelectedTextStyle(preset.patch)}
                          className={`min-h-10 rounded-lg border px-2 text-xs font-bold ${selectedTextStyle.effect === preset.id ? 'border-orange-400 bg-orange-500 text-white' : 'border-white/20 text-slate-200 hover:bg-white/10'}`}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-bold text-slate-300">
                      主颜色
                      <input
                        type="color"
                        value={colorInputValue(selectedTextStyle.fill, '#FFFFFF')}
                        onChange={(event) => updateSelectedTextStyle({ fill: event.target.value })}
                        className="mt-2 h-10 w-full rounded-lg border border-white/20 bg-transparent"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-300">
                      描边颜色
                      <input
                        type="color"
                        value={colorInputValue(selectedTextStyle.strokeColor, '#111111')}
                        onChange={(event) => updateSelectedTextStyle({ strokeColor: event.target.value })}
                        disabled={!selectedTextStyle.strokeEnabled}
                        className="mt-2 h-10 w-full rounded-lg border border-white/20 bg-transparent disabled:opacity-35"
                      />
                    </label>
                  </div>

                  <label className="block text-xs font-bold text-slate-300">
                    填充方式
                    <select
                      value={selectedTextStyle.fillMode}
                      onChange={(event) => updateSelectedTextStyle({ fillMode: event.target.value as PosterTextFillMode })}
                      className="mt-2 min-h-10 w-full rounded-lg border border-white/20 bg-slate-800 px-2 text-sm text-white"
                    >
                      <option value="solid">单色</option>
                      <option value="gradient">三色渐变</option>
                      <option value="characters">逐字配色</option>
                    </select>
                  </label>

                  {selectedTextStyle.fillMode !== 'solid' && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs font-bold text-slate-300">
                        第二颜色
                        <input
                          type="color"
                          value={colorInputValue(selectedTextStyle.fillSecondary, '#FF861A')}
                          onChange={(event) => updateSelectedTextStyle({ fillSecondary: event.target.value })}
                          className="mt-2 h-10 w-full rounded-lg border border-white/20 bg-transparent"
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-300">
                        第三颜色
                        <input
                          type="color"
                          value={colorInputValue(selectedTextStyle.fillTertiary, '#F23A20')}
                          onChange={(event) => updateSelectedTextStyle({ fillTertiary: event.target.value })}
                          className="mt-2 h-10 w-full rounded-lg border border-white/20 bg-transparent"
                        />
                      </label>
                    </div>
                  )}

                  <label className="flex min-h-10 items-center justify-between rounded-lg border border-white/15 px-3 text-xs font-bold text-slate-300">
                    <span>开启描边</span>
                    <input
                      type="checkbox"
                      checked={selectedTextStyle.strokeEnabled}
                      onChange={(event) => updateSelectedTextStyle({ strokeEnabled: event.target.checked })}
                      className="h-5 w-5 accent-orange-500"
                    />
                  </label>

                  <label className={`block text-xs font-bold text-slate-300 ${selectedTextStyle.strokeEnabled ? '' : 'opacity-40'}`}>
                    描边粗细 {selectedTextStyle.strokeWidth}px
                    <input
                      type="range"
                      min="1"
                      max="24"
                      step="1"
                      value={selectedTextStyle.strokeWidth}
                      onChange={(event) => updateSelectedTextStyle({ strokeWidth: Number(event.target.value) })}
                      disabled={!selectedTextStyle.strokeEnabled}
                      className="mt-2 w-full accent-orange-500"
                    />
                  </label>

                  <div>
                    <div className="text-xs font-bold text-slate-300">字体</div>
                    <select
                      value={selectedTextStyle.fontFamily}
                      onChange={(event) => updateSelectedTextStyle({ fontFamily: event.target.value })}
                      className="mt-2 hidden min-h-10 w-full rounded-lg border border-white/20 bg-slate-800 px-2 text-sm text-white lg:block"
                    >
                      {posterFontOptions.map((font) => <option key={font.name} value={font.value}>{font.name}</option>)}
                    </select>
                    <div className="mt-2 grid grid-cols-2 gap-2 lg:hidden">
                      {posterFontOptions.map((font) => {
                        const isActive = selectedTextStyle.fontFamily === font.value;
                        return (
                          <button
                            key={font.name}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => updateSelectedTextStyle({ fontFamily: font.value })}
                            className={`min-h-11 touch-manipulation rounded-lg border px-2 text-sm ${isActive ? 'border-orange-400 bg-orange-500 text-white' : 'border-white/20 text-slate-200 hover:bg-white/10'}`}
                            style={{ fontFamily: font.value }}
                          >
                            {font.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs font-bold text-slate-300">
                      字重
                      <select
                        value={selectedTextStyle.fontWeight}
                        onChange={(event) => updateSelectedTextStyle({ fontWeight: Number(event.target.value) })}
                        className="mt-2 min-h-10 w-full rounded-lg border border-white/20 bg-slate-800 px-2 text-sm text-white"
                      >
                        <option value="400">常规</option>
                        <option value="600">半粗</option>
                        <option value="800">粗体</option>
                        <option value="900">特粗</option>
                      </select>
                    </label>
                    <label className="block text-xs font-bold text-slate-300">
                      字间距 {selectedTextStyle.letterSpacing}px
                      <input
                        type="range"
                        min="-4"
                        max="30"
                        step="1"
                        value={selectedTextStyle.letterSpacing}
                        onChange={(event) => updateSelectedTextStyle({ letterSpacing: Number(event.target.value) })}
                        className="mt-3 w-full accent-orange-500"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs font-bold text-slate-300">
                      横向拉伸 {selectedTextStyle.scaleX.toFixed(2)}
                      <input
                        type="range"
                        min="0.6"
                        max="1.6"
                        step="0.02"
                        value={selectedTextStyle.scaleX}
                        onChange={(event) => updateSelectedTextStyle({ scaleX: Number(event.target.value) })}
                        className="mt-3 w-full accent-orange-500"
                      />
                    </label>
                    <label className="block text-xs font-bold text-slate-300">
                      纵向拉伸 {selectedTextStyle.scaleY.toFixed(2)}
                      <input
                        type="range"
                        min="0.6"
                        max="1.4"
                        step="0.02"
                        value={selectedTextStyle.scaleY}
                        onChange={(event) => updateSelectedTextStyle({ scaleY: Number(event.target.value) })}
                        className="mt-3 w-full accent-orange-500"
                      />
                    </label>
                  </div>

                  <label className="block text-xs font-bold text-slate-300">
                    文字倾斜 {selectedTextStyle.skewX}°
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      step="1"
                      value={selectedTextStyle.skewX}
                      onChange={(event) => updateSelectedTextStyle({ skewX: Number(event.target.value) })}
                      className="mt-2 w-full accent-orange-500"
                    />
                  </label>

                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                      <span>标题弧度</span>
                      <span>{selectedTextStyle.curve > 0 ? `拱形 +${selectedTextStyle.curve}` : selectedTextStyle.curve < 0 ? `下弧 ${selectedTextStyle.curve}` : '直线'}</span>
                    </div>
                    <input
                      type="range"
                      min="-160"
                      max="160"
                      step="4"
                      value={selectedTextStyle.curve}
                      onChange={(event) => updateSelectedTextStyle({ curve: Number(event.target.value) })}
                      className="mt-2 w-full accent-orange-500"
                    />
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {([[-70, '下弧'], [0, '直线'], [70, '拱形']] as const).map(([curve, label]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => updateSelectedTextStyle({ curve })}
                          className={`min-h-9 rounded-lg border px-2 text-xs font-bold ${selectedTextStyle.curve === curve ? 'border-orange-400 bg-orange-500 text-white' : 'border-white/20 text-slate-200 hover:bg-white/10'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr_84px] gap-2">
                    <label className="block text-xs font-bold text-slate-300">
                      立体厚度 {selectedTextStyle.extrusionDepth}px
                      <input
                        type="range"
                        min="0"
                        max="24"
                        step="1"
                        value={selectedTextStyle.extrusionDepth}
                        onChange={(event) => updateSelectedTextStyle({ extrusionDepth: Number(event.target.value) })}
                        className="mt-3 w-full accent-orange-500"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-300">
                      立体颜色
                      <input
                        type="color"
                        value={colorInputValue(selectedTextStyle.extrusionColor, '#111111')}
                        onChange={(event) => updateSelectedTextStyle({ extrusionColor: event.target.value })}
                        disabled={selectedTextStyle.extrusionDepth === 0}
                        className="mt-2 h-10 w-full rounded-lg border border-white/20 bg-transparent disabled:opacity-35"
                      />
                    </label>
                  </div>

                  <label className={`block text-xs font-bold text-slate-300 ${selectedTextStyle.fillMode === 'characters' ? '' : 'opacity-40'}`}>
                    单字节奏 {selectedTextStyle.characterRhythm}
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="1"
                      value={selectedTextStyle.characterRhythm}
                      onChange={(event) => updateSelectedTextStyle({ characterRhythm: Number(event.target.value) })}
                      disabled={selectedTextStyle.fillMode !== 'characters'}
                      className="mt-2 w-full accent-orange-500"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTextStyles((current) => current.filter((style) => style.id !== selectedLayer.id))}
                      className="min-h-10 rounded-lg border border-white/20 px-2 text-xs font-bold hover:bg-white/10"
                    >
                      重置文字样式
                    </button>
                    <button
                      type="button"
                      onClick={() => setTextStyles(applyPosterTextStyleToAll(layers, selectedTextStyle))}
                      className="min-h-10 rounded-lg bg-orange-500 px-2 text-xs font-black text-white hover:bg-orange-600"
                    >
                      应用到全部文字
                    </button>
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs font-bold text-slate-300">层级</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {([
                    ['backward', '下移一层'], ['forward', '上移一层'], ['back', '置于底层'], ['front', '置于顶层'],
                  ] as const).map(([direction, label]) => (
                    <button key={direction} type="button" onClick={() => setTransforms((current) => movePosterLayer(current, selected.id, direction))} className="min-h-10 rounded-lg border border-white/20 px-2 text-xs font-bold hover:bg-white/10">{label}</button>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => updateTransform(selected.id, (current) => ({ ...current, x: selectedLayer.x, y: selectedLayer.y, scale: 1, rotation: 0 }))} className="min-h-10 w-full rounded-lg border border-white/20 px-3 text-sm font-bold hover:bg-white/10">重置当前元素</button>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/20 p-4 text-sm leading-6 text-slate-400">点击海报中的文字或图片后，可精确调整大小、角度和层级。</div>
          )}
        </aside>
      </div>

      <footer className="flex shrink-0 justify-end gap-2 border-t border-white/10 bg-slate-900 px-3 py-3 sm:px-5">
        <button type="button" onClick={requestClose} className="min-h-11 rounded-lg border border-white/20 px-5 text-sm font-black text-slate-200">取消</button>
        <button type="button" onClick={() => onApply(transforms, textStyles)} className="min-h-11 rounded-lg bg-orange-500 px-6 text-sm font-black text-white shadow">应用布局</button>
      </footer>
    </div>
  );
}
