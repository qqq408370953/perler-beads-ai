'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent, CSSProperties, KeyboardEvent } from 'react';
import type { ColorSystem } from '../utils/colorSystemUtils';
import { normalizeColorCountInput } from '../utils/colorCountInput';
import MobileSafeRange from './MobileSafeRange';

export type PatternPresetId = 'economy' | 'balanced' | 'portrait' | 'detailed' | 'large';

export type PatternPreset = {
  id: PatternPresetId;
  label: string;
  granularity: number;
  maxColorCount: number;
  similarityThreshold: number;
};

type ProcessingOption = 'horizontalMirror' | 'verticalMirror' | 'removeBackground' | 'outline';

type PatternSettingsPanelProps = {
  presets: readonly PatternPreset[];
  selectedPreset: PatternPresetId | null;
  onPresetChange: (preset: PatternPreset) => void;
  processing: Record<ProcessingOption, boolean>;
  onProcessingToggle: (option: ProcessingOption) => void;
  colorSystems: readonly { key: string; name: string }[];
  selectedColorSystem: ColorSystem;
  onColorSystemChange: (colorSystem: ColorSystem) => void;
  onManagePalette: () => void;
  selectedPaletteColorCount: number;
  isCustomPalette: boolean;
  granularity: number;
  gridDimensions: { N: number; M: number } | null;
  onGranularityChange: (value: number) => void;
  maxColorCount: number;
  paletteColorCount: number;
  onMaxColorCountChange: (value: number) => void;
  brightness: number;
  onBrightnessChange: (value: number) => void;
};

const processingOptions: readonly { key: ProcessingOption; label: string }[] = [
  { key: 'horizontalMirror', label: '水平镜像' },
  { key: 'verticalMirror', label: '垂直镜像' },
  { key: 'removeBackground', label: '去背景' },
  { key: 'outline', label: '加描边' },
];

const cardClass = 'rounded-2xl border border-[#e6dfd4] bg-[#fffdf8] p-4 shadow-[0_8px_24px_rgba(83,67,45,0.08)] sm:p-5 dark:border-gray-700 dark:bg-gray-800';
const activePillClass = 'border-[#f28a2e] bg-gradient-to-b from-[#ffad5c] to-[#f28428] text-white shadow-[0_6px_14px_rgba(242,132,40,0.24)]';
const idlePillClass = 'border-[#ddd5c9] bg-[#fffefa] text-[#736d64] hover:border-[#f2a25a] hover:text-[#cf6d17] dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200';

function SettingHeader({ title, value }: { title: string; value?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-lg font-black tracking-tight text-[#2d2924] dark:text-gray-100">{title}</h3>
      {value && <span className="shrink-0 text-base font-black text-[#2d2924] dark:text-gray-100">{value}</span>}
    </div>
  );
}

function RangeCard({
  title,
  valueLabel,
  value,
  min,
  max,
  step = 1,
  lowLabel,
  highLabel,
  accent,
  onChange,
}: {
  title: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  lowLabel: string;
  highLabel: string;
  accent: string;
  onChange: (value: number) => void;
}) {
  const progress = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <section className={cardClass}>
      <SettingHeader title={title} value={valueLabel} />
      <MobileSafeRange
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={onChange}
        className="pattern-settings-range"
        style={{
          '--range-accent': accent,
          '--range-progress': `${progress}%`,
        } as CSSProperties}
        ariaLabel={title}
      />
      <div className="mt-1 flex justify-between text-xs font-medium text-[#aaa297] dark:text-gray-400">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
      <p className="mt-2 text-center text-[11px] font-semibold text-[#aaa297] sm:hidden dark:text-gray-400">
        横向拖动调节 · 纵向滑动不会改值
      </p>
    </section>
  );
}

function ColorCountInputCard({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  const commitValue = () => {
    const nextValue = normalizeColorCountInput(draftValue, value, max);
    setDraftValue(String(nextValue));
    if (nextValue !== value) onChange(nextValue);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDraftValue = event.currentTarget.value;
    setDraftValue(nextDraftValue);

    if (!/^\d+$/.test(nextDraftValue)) return;

    const nextValue = Number(nextDraftValue);
    if (nextValue >= 1 && nextValue <= max && nextValue !== value) {
      onChange(nextValue);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  return (
    <section className={cardClass}>
      <SettingHeader title="色彩数量" value={`${value} / ${max} 种`} />
      <div className="flex items-center justify-center gap-3">
        <label htmlFor="pattern-color-count" className="text-sm font-bold text-[#736d64] dark:text-gray-300">
          使用颜色
        </label>
        <div className="flex items-center overflow-hidden rounded-xl border border-[#ddd5c9] bg-[#fffefa] shadow-inner focus-within:border-[#f28a2e] focus-within:ring-2 focus-within:ring-[#f28a2e]/20 dark:border-gray-600 dark:bg-gray-700">
          <input
            id="pattern-color-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            step={1}
            value={draftValue}
            onChange={handleChange}
            onBlur={commitValue}
            onKeyDown={handleKeyDown}
            onWheel={(event) => event.currentTarget.blur()}
            className="h-12 w-24 bg-transparent px-3 text-center text-lg font-black text-[#2d2924] outline-none dark:text-gray-100"
            aria-label={`色彩数量，范围 1 到 ${max}`}
          />
          <span className="border-l border-[#e6dfd4] px-3 text-sm font-bold text-[#736d64] dark:border-gray-600 dark:text-gray-300">
            种
          </span>
        </div>
      </div>
      <p className="mt-2 text-center text-xs font-medium text-[#aaa297] dark:text-gray-400">
        手动输入 1–{max} 之间的整数
      </p>
    </section>
  );
}

export default function PatternSettingsPanel({
  presets,
  selectedPreset,
  onPresetChange,
  processing,
  onProcessingToggle,
  colorSystems,
  selectedColorSystem,
  onColorSystemChange,
  onManagePalette,
  selectedPaletteColorCount,
  isCustomPalette,
  granularity,
  gridDimensions,
  onGranularityChange,
  maxColorCount,
  paletteColorCount,
  onMaxColorCountChange,
  brightness,
  onBrightnessChange,
}: PatternSettingsPanelProps) {
  const selectedPresetLabel = presets.find((preset) => preset.id === selectedPreset)?.label ?? '自定义';
  const selectedSystemLabel = colorSystems.find((system) => system.key === selectedColorSystem)?.name ?? selectedColorSystem;
  const effectivePaletteCount = Math.max(1, paletteColorCount);

  return (
    <div className="mt-5 grid w-full gap-4" aria-label="图纸生成设置">
      <section className={cardClass}>
        <SettingHeader title="制作预设" value={selectedPresetLabel} />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onPresetChange(preset)}
              className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-black transition sm:text-base ${selectedPreset === preset.id ? activePillClass : idlePillClass}`}
              aria-pressed={selectedPreset === preset.id}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <section className={cardClass}>
        <SettingHeader title="生成处理" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {processingOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onProcessingToggle(option.key)}
              className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-black transition sm:text-base ${processing[option.key] ? activePillClass : idlePillClass}`}
              aria-pressed={processing[option.key]}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className={cardClass}>
        <SettingHeader title="品牌色号" value={selectedSystemLabel} />
        <div className="flex flex-wrap gap-2">
          {colorSystems.map((system) => (
            <button
              key={system.key}
              type="button"
              onClick={() => onColorSystemChange(system.key as ColorSystem)}
              className={`min-h-11 rounded-full border px-4 py-2 text-sm font-black transition sm:text-base ${selectedColorSystem === system.key ? activePillClass : idlePillClass}`}
              aria-pressed={selectedColorSystem === system.key}
            >
              {system.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onManagePalette}
          className="mt-3 min-h-10 rounded-full border border-[#ead7c2] bg-[#fff8ef] px-4 py-2 text-sm font-bold text-[#bd681d] transition hover:bg-[#fff0df] dark:border-gray-600 dark:bg-gray-700 dark:text-orange-300"
        >
          管理色板（{selectedPaletteColorCount} 色）{isCustomPalette ? ' · 自定义' : ''}
        </button>
      </section>

      <RangeCard
        title="网格宽度"
        valueLabel={gridDimensions ? `${gridDimensions.N} × ${gridDimensions.M}` : `${granularity}`}
        value={granularity}
        min={24}
        max={180}
        lowLabel="大颗粒"
        highLabel="超细致"
        accent="#f3c628"
        onChange={onGranularityChange}
      />

      <ColorCountInputCard
        value={Math.min(maxColorCount, effectivePaletteCount)}
        max={effectivePaletteCount}
        onChange={onMaxColorCountChange}
      />

      <RangeCard
        title="图纸亮度"
        valueLabel={`${brightness > 0 ? '+' : ''}${brightness}%`}
        value={brightness}
        min={-50}
        max={50}
        lowLabel="暗一些"
        highLabel="亮一些"
        accent="#25d4cf"
        onChange={onBrightnessChange}
      />
    </div>
  );
}
