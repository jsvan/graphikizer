import type { FocalPoint, TextOverlay } from "./types";

/** Percentage-space radius for a marble (~24px on ~800px panel). */
const MARBLE_RADIUS = 3;

/** Map FocalPoint to percentage coordinates (mirrors CharacterMarble.tsx). */
function focalPointToPercent(position: FocalPoint): { x: number; y: number } {
  const map: Record<string, { x: number; y: number }> = {
    left: { x: 12, y: 45 },
    center: { x: 50, y: 45 },
    right: { x: 88, y: 45 },
    top: { x: 50, y: 15 },
    bottom: { x: 50, y: 75 },
    "top-left": { x: 12, y: 15 },
    "top-right": { x: 88, y: 15 },
    "bottom-left": { x: 12, y: 75 },
    "bottom-right": { x: 88, y: 75 },
  };
  return map[position] || { x: 50, y: 45 };
}

/** Estimate overlay bounding rect in percentage-space. */
function overlayRect(overlay: TextOverlay): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const w = overlay.maxWidthPercent || 30;
  // Rough height estimate: ~8% for short text, ~15% for long
  const h = overlay.text.length < 60 ? 8 : 15;
  return { x: overlay.x, y: overlay.y, w, h };
}

/** Check if a marble circle collides with a rect. */
function circleRectCollides(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  const nearestX = Math.max(rx, Math.min(cx, rx + rw));
  const nearestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy < r * r;
}

/** All candidate positions a marble could move to. */
const CANDIDATE_POSITIONS: FocalPoint[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

/**
 * Resolve marble positions to avoid overlapping narration/caption overlays.
 * Returns an array of FocalPoints (same length as marblePositions input).
 */
export function resolveMarbleCollisions(
  marblePositions: FocalPoint[],
  overlays: TextOverlay[]
): FocalPoint[] {
  // Only check collision against narration + caption overlays
  const blockingOverlays = overlays.filter(
    (o) => o.type === "narration" || o.type === "caption"
  );

  if (blockingOverlays.length === 0) return marblePositions;

  const rects = blockingOverlays.map(overlayRect);

  return marblePositions.map((pos) => {
    const { x: cx, y: cy } = focalPointToPercent(pos);

    // Check if current position collides
    const collides = rects.some((r) =>
      circleRectCollides(cx, cy, MARBLE_RADIUS, r.x, r.y, r.w, r.h)
    );

    if (!collides) return pos;

    // Try each candidate position, pick nearest non-colliding one
    let bestPos = pos;
    let bestDist = Infinity;

    for (const candidate of CANDIDATE_POSITIONS) {
      const { x: nx, y: ny } = focalPointToPercent(candidate);
      const candidateCollides = rects.some((r) =>
        circleRectCollides(nx, ny, MARBLE_RADIUS, r.x, r.y, r.w, r.h)
      );
      if (!candidateCollides) {
        const dist = Math.hypot(nx - cx, ny - cy);
        if (dist < bestDist) {
          bestDist = dist;
          bestPos = candidate;
        }
      }
    }

    return bestPos;
  });
}
