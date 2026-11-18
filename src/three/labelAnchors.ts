// Registry of DOM labels pinned to world positions (filled by ScreenLabels, read by LabelProjector).
export interface LabelAnchor {
  x: number;
  y: number;
  z: number;
  el: HTMLElement | null;
}
export const LABEL_ANCHORS = new Map<string, LabelAnchor>();

export function anchorRef(key: string, x: number, y: number, z: number) {
  return (el: HTMLElement | null) => {
    if (el) LABEL_ANCHORS.set(key, { x, y, z, el });
    else LABEL_ANCHORS.delete(key);
  };
}
