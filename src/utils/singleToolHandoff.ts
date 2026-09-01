import { ColorSystem } from './colorSystemUtils';
import { MappedPixel, PixelationMode } from './pixelation';
import { PatternGenerationOptions, PatternGenerationResult } from './patternGenerator';

const SINGLE_TOOL_HANDOFF_KEY = 'perlerBeadsSingleToolHandoff';

export interface SingleToolHandoffPayload {
  sourceImageSrc: string;
  fileName: string;
  options: PatternGenerationOptions;
  result: PatternGenerationResult;
  batchContext?: {
    itemId: string;
  };
}

function isPixelationMode(value: unknown): value is PixelationMode {
  return value === PixelationMode.Dominant || value === PixelationMode.Average;
}

function isColorSystem(value: unknown): value is ColorSystem {
  return value === '通用221色' || value === 'MARD' || value === 'COCO' || value === '漫漫' || value === '盼盼' || value === '咪小窝';
}

function isMappedPixelGrid(value: unknown): value is MappedPixel[][] {
  return Array.isArray(value) && value.every((row) => (
    Array.isArray(row) && row.every((cell) => (
      cell
      && typeof cell === 'object'
      && typeof (cell as MappedPixel).key === 'string'
      && typeof (cell as MappedPixel).color === 'string'
    ))
  ));
}

function isValidPayload(value: unknown): value is SingleToolHandoffPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as SingleToolHandoffPayload;

  return (
    typeof payload.sourceImageSrc === 'string'
    && payload.sourceImageSrc.length > 0
    && typeof payload.fileName === 'string'
    && typeof payload.options?.granularity === 'number'
    && typeof payload.options?.similarityThreshold === 'number'
    && typeof payload.options?.maxColorCount === 'number'
    && isPixelationMode(payload.options?.pixelationMode)
    && isColorSystem(payload.options?.selectedColorSystem)
    && typeof payload.options?.autoRemoveBackground === 'boolean'
    && isMappedPixelGrid(payload.result?.mappedPixelData)
    && typeof payload.result?.gridDimensions?.N === 'number'
    && typeof payload.result?.gridDimensions?.M === 'number'
    && typeof payload.result?.colorCounts === 'object'
    && typeof payload.result?.totalBeadCount === 'number'
    && (
      payload.batchContext === undefined
      || typeof payload.batchContext?.itemId === 'string'
    )
  );
}

export function saveSingleToolHandoff(payload: SingleToolHandoffPayload): void {
  localStorage.setItem(SINGLE_TOOL_HANDOFF_KEY, JSON.stringify(payload));
}

export function consumeSingleToolHandoff(): SingleToolHandoffPayload | null {
  try {
    const rawValue = localStorage.getItem(SINGLE_TOOL_HANDOFF_KEY);
    if (!rawValue) return null;

    localStorage.removeItem(SINGLE_TOOL_HANDOFF_KEY);
    const parsedValue: unknown = JSON.parse(rawValue);
    return isValidPayload(parsedValue) ? parsedValue : null;
  } catch (error) {
    console.error('读取批量到单图精修数据失败:', error);
    localStorage.removeItem(SINGLE_TOOL_HANDOFF_KEY);
    return null;
  }
}
