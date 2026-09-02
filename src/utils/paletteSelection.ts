type PaletteSelections = Record<string, boolean>;

type SelectGenerationPaletteOptions<T extends { hex: string }> = {
  palette: T[];
  customSelections?: PaletteSelections;
  useCustomPalette?: boolean;
  excludedColorKeys?: ReadonlySet<string>;
};

/**
 * 生成时的品牌色板必须由显式模式决定。
 * 旧版保存在 localStorage 中的勾选记录只是一份草稿，不能悄悄覆盖品牌全色。
 */
export function selectGenerationPalette<T extends { hex: string }>({
  palette,
  customSelections = {},
  useCustomPalette = false,
  excludedColorKeys,
}: SelectGenerationPaletteOptions<T>): T[] {
  return palette.filter((color) => {
    const normalizedHex = color.hex.toUpperCase();
    if (excludedColorKeys?.has(normalizedHex)) return false;
    return !useCustomPalette || customSelections[normalizedHex] === true;
  });
}
