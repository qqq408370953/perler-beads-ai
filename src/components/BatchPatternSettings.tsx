'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { colorSystemOptions, type ColorSystem } from '../utils/colorSystemUtils';
import { normalizeColorCountInput } from '../utils/colorCountInput';
import {
  findMatchingPatternPreset,
  PATTERN_PRESETS,
  type PatternGenerationOptions,
} from '../utils/patternGenerationOptions';
import { buildDefaultBeadPalette } from '../utils/patternGenerator';
import MobileSafeRange from './MobileSafeRange';

type BatchPatternSettingsProps = {
  options: PatternGenerationOptions;
  disabled?: boolean;
  compact?: boolean;
  onChange: (patch: Partial<PatternGenerationOptions>) => void;
};

const processingOptions: readonly {
  key: 'horizontalMirror' | 'verticalMirror' | 'autoRemoveBackground' | 'outline';
  label: string;
}[] = [
  { key: 'horizontalMirror', label: '水平镜像' },
  { key: 'verticalMirror', label: '垂直镜像' },
  { key: 'autoRemoveBackground', label: '去背景' },
  { key: 'outline', label: '加描边' },
];

const activePillClass = 'border-orange-400 bg-orange-500 text-white shadow-sm';
const idlePillClass = 'border-stone-300 bg-white text-stone-600 hover:border-orange-300 hover:text-orange-700';

function SettingsHeader({ title, value }: { title: string; value?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-sm font-black text-slate-950">{title}</h3>
      {value && <span className="text-xs font-black text-slate-700">{value}</span>}
    </div>
  );
}

function SettingsRange({
  title,
  value,
  valueLabel,
  min,
  max,
  accent,
  onChange,
}: {
  title: string;
  value: number;
  valueLabel: string;
  min: number;
  max: number;
  accent: string;
  onChange: (value: number) => void;
}) {
  const progress = ((value - min) / (max - min)) * 100;

  return (
    <div>
      <SettingsHeader title={title} value={valueLabel} />
      <MobileSafeRange
        min={min}
        max={max}
        step={1}
        value={value}
        onValueChange={onChange}
        className="pattern-settings-range"
        style={{
          '--range-accent': accent,
          '--range-progress': `${progress}%`,
        } as CSSProperties}
        ariaLabel={title}
      />
    </div>
  );
}

export default function BatchPatternSettings({
  options,
  disabled = false,
  compact = false,
  onChange,
}: BatchPatternSettingsProps) {
  const selectedPreset = findMatchingPatternPreset(options);
  const selectedPresetLabel = PATTERN_PRESETS.find((preset) => preset.id === selectedPreset)?.label ?? '自定义';
  const paletteColorCount = useMemo(
    () => Math.max(1, buildDefaultBeadPalette(options.selectedColorSystem).length),
    [options.selectedColorSystem],
  );
  const effectiveColorCount = Math.min(options.maxColorCount, paletteColorCount);
  const [colorDraft, setColorDraft] = useState(String(effectiveColorCount));

  useEffect(() => {
    setColorDraft(String(effectiveColorCount));
  }, [effectiveColorCount]);

  const commitColorCount = () => {
    const nextValue = normalizeColorCountInput(colorDraft, effectiveColorCount, paletteColorCount);
    setColorDraft(String(nextValue));
    if (nextValue !== options.maxColorCount) onChange({ maxColorCount: nextValue });
  };

  const handleColorKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  const sectionClass = compact
    ? 'border-t border-slate-200 pt-3 first:border-t-0 first:pt-0'
    : 'rounded-xl border border-stone-200 bg-[#fffdf8] p-3';

  return (
    <fieldset disabled={disabled} className="space-y-3" aria-label="批量图纸生成设置">
      <section className={sectionClass}>
        <SettingsHeader title="制作预设" value={selectedPresetLabel} />
        <div className="grid grid-cols-3 gap-1.5 xl:grid-cols-5">
          {PATTERN_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              aria-pressed={selectedPreset === preset.id}
              onClick={() => onChange({
                granularity: preset.granularity,
                maxColorCount: Math.min(preset.maxColorCount, paletteColorCount),
                similarityThreshold: preset.similarityThreshold,
              })}
              className={`min-h-10 rounded-lg border px-1.5 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${selectedPreset === preset.id ? activePillClass : idlePillClass}`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <section className={sectionClass}>
        <SettingsHeader title="生成处理" />
        <div className="grid grid-cols-2 gap-1.5">
          {processingOptions.map((processingOption) => {
            const active = options[processingOption.key];
            return (
              <button
                key={processingOption.key}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => onChange({ [processingOption.key]: !active })}
                className={`min-h-10 rounded-lg border px-2 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? activePillClass : idlePillClass}`}
              >
                {processingOption.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className={sectionClass}>
        <SettingsHeader
          title="品牌色号"
          value={colorSystemOptions.find((system) => system.key === options.selectedColorSystem)?.name}
        />
        <div className="flex flex-wrap gap-1.5">
          {colorSystemOptions.map((system) => {
            const active = options.selectedColorSystem === system.key;
            return (
              <button
                key={system.key}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => {
                  const selectedColorSystem = system.key as ColorSystem;
                  const nextPaletteCount = Math.max(1, buildDefaultBeadPalette(selectedColorSystem).length);
                  onChange({
                    selectedColorSystem,
                    maxColorCount: Math.min(options.maxColorCount, nextPaletteCount),
                  });
                }}
                className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? activePillClass : idlePillClass}`}
              >
                {system.name}
              </button>
            );
          })}
        </div>
      </section>

      <section className={sectionClass}>
        <SettingsRange
          title="网格宽度"
          value={options.granularity}
          valueLabel={`${options.granularity}`}
          min={24}
          max={180}
          accent="#f3c628"
          onChange={(granularity) => onChange({ granularity })}
        />
      </section>

      <section className={sectionClass}>
        <SettingsHeader title="色彩数量" value={`${effectiveColorCount} / ${paletteColorCount} 种`} />
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={paletteColorCount}
            step={1}
            value={colorDraft}
            disabled={disabled}
            onChange={(event) => {
              const nextDraft = event.currentTarget.value;
              setColorDraft(nextDraft);
              if (!/^\d+$/.test(nextDraft)) return;
              const nextValue = Number(nextDraft);
              if (nextValue >= 1 && nextValue <= paletteColorCount && nextValue !== options.maxColorCount) {
                onChange({ maxColorCount: nextValue });
              }
            }}
            onBlur={commitColorCount}
            onKeyDown={handleColorKeyDown}
            onWheel={(event) => event.currentTarget.blur()}
            aria-label={`色彩数量，范围 1 到 ${paletteColorCount}`}
            className="h-10 w-24 rounded-lg border border-stone-300 bg-white px-2 text-center text-sm font-black outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="text-xs font-bold text-slate-500">手动输入 1–{paletteColorCount}</span>
        </div>
      </section>

      <section className={sectionClass}>
        <SettingsRange
          title="图纸亮度"
          value={options.brightness}
          valueLabel={`${options.brightness > 0 ? '+' : ''}${options.brightness}%`}
          min={-50}
          max={50}
          accent="#25d4cf"
          onChange={(brightness) => onChange({ brightness })}
        />
      </section>
    </fieldset>
  );
}
