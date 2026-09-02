export function normalizeColorCountInput(
  rawValue: string,
  currentValue: number,
  paletteColorCount: number,
): number {
  const parsedValue = Number(rawValue);

  if (rawValue.trim() === '' || !Number.isFinite(parsedValue)) {
    return currentValue;
  }

  const maximum = Math.max(1, Math.floor(paletteColorCount));
  return Math.min(maximum, Math.max(1, Math.round(parsedValue)));
}
