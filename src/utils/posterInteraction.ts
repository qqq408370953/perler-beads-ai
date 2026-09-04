export type PosterPointerSample = {
  x: number;
  y: number;
  scrollTop: number;
};

const PANEL_SCROLL_ACTIVATION_THRESHOLD = 8;

export function canStartPosterLayerGesture(selectedId: string | null, layerId: string): boolean {
  return selectedId === null || selectedId === layerId;
}

export function shouldSuppressPosterPanelActivation(
  start: PosterPointerSample,
  current: PosterPointerSample,
): boolean {
  const pointerDistance = Math.hypot(current.x - start.x, current.y - start.y);
  const scrollDistance = Math.abs(current.scrollTop - start.scrollTop);

  return pointerDistance >= PANEL_SCROLL_ACTIVATION_THRESHOLD || scrollDistance > 2;
}
