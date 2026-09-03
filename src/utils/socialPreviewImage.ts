const SOCIAL_PREVIEW_GRID_MAX_EDGE = 1024;
const SOCIAL_PREVIEW_MAX_CELL_SIZE = 16;
const SOCIAL_PREVIEW_MIN_CELL_SIZE = 2;
const TRANSPARENT_KEY = 'ERASE';

export type SocialPreviewCell = {
  key: string;
  color: string;
  isExternal?: boolean;
};

export function calculateSocialPreviewCellSize({ N, M }: { N: number; M: number }): number {
  const longestGridEdge = Math.max(1, N, M);

  return Math.max(
    SOCIAL_PREVIEW_MIN_CELL_SIZE,
    Math.min(SOCIAL_PREVIEW_MAX_CELL_SIZE, Math.floor(SOCIAL_PREVIEW_GRID_MAX_EDGE / longestGridEdge)),
  );
}

export function isSocialPreviewBackgroundCell(cell?: SocialPreviewCell | null): boolean {
  return !cell || cell.isExternal === true || cell.key === TRANSPARENT_KEY;
}

export function calculateSocialPreviewStatsLayout(colorCount: number, availableWidth: number) {
  const columns = Math.max(1, Math.min(12, Math.floor(availableWidth / 72)));
  const rows = Math.ceil(Math.max(0, colorCount) / columns);
  const rowHeight = 48;

  return {
    columns,
    rows,
    rowHeight,
    height: rows > 0 ? 36 + rows * rowHeight + 20 : 0,
  };
}

export function getSocialPreviewCrossSegments(cellSize: number): Array<[number, number, number, number]> {
  const markSize = Math.max(2, Math.round(cellSize * 0.46));
  const start = (cellSize - markSize) / 2;
  const end = start + markSize;

  return [
    [start, start, end, end],
    [end, start, start, end],
  ];
}

export function getSocialPreviewGridLineStyles() {
  return {
    minor: { color: 'rgba(82, 78, 71, 0.34)', width: 1 },
    major: { color: 'rgba(69, 65, 59, 0.34)', width: 1 },
  };
}
