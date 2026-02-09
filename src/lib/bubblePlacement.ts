import type { TextOverlay, PanelLayout, OverlayType, FocalPoint } from "./types";

/**
 * Slot-based bubble placement system for comic panels.
 *
 * Places overlays around the panel perimeter, keeping the focal area
 * clear so the main subject is visible. Uses the panel's focalPoint
 * to vary placement across panels — text goes AWAY from the subject.
 */

interface Slot {
  id: string;
  x: number;
  y: number;
  anchor: TextOverlay["anchor"];
}

// 8 placement slots around the panel perimeter.
const SLOTS: Record<string, Slot> = {
  TL: { id: "TL", x: 3,   y: 3,  anchor: "top-left" },
  TC: { id: "TC", x: 50,  y: 2,  anchor: "center" },
  TR: { id: "TR", x: 97,  y: 3,  anchor: "top-right" },
  ML: { id: "ML", x: -3,  y: 40, anchor: "top-left" },
  MR: { id: "MR", x: 103, y: 40, anchor: "top-right" },
  BL: { id: "BL", x: 3,   y: 65, anchor: "top-left" },
  BC: { id: "BC", x: 50,  y: 65, anchor: "center" },
  BR: { id: "BR", x: 97,  y: 65, anchor: "top-right" },
};

// Base slot preferences per overlay type (used when no focal point)
const DIALOGUE_SLOTS = ["TL", "TR", "ML", "MR", "BL", "BR"];
const NARRATION_SLOTS = ["TL", "TR", "BL", "BR", "ML", "MR"];
const CAPTION_SLOTS = ["TC", "TR", "TL", "BC", "BR", "BL"];

/**
 * Slots to AVOID for each focal point value.
 * Text placed in these slots would cover the main subject.
 */
const FOCAL_AVOID: Record<string, Set<string>> = {
  "center":       new Set(["TC", "BC", "ML", "MR"]),
  "left":         new Set(["TL", "ML", "BL"]),
  "right":        new Set(["TR", "MR", "BR"]),
  "top":          new Set(["TL", "TC", "TR"]),
  "bottom":       new Set(["BL", "BC", "BR"]),
  "top-left":     new Set(["TL", "TC", "ML"]),
  "top-right":    new Set(["TR", "TC", "MR"]),
  "bottom-left":  new Set(["BL", "BC", "ML"]),
  "bottom-right": new Set(["BR", "BC", "MR"]),
};

/** Padding added to each side of estimated bounding boxes (in %) */
const BBOX_PADDING = 4;

/** Don't let collision nudges push overlays past these Y bounds */
const MIN_Y = -5;
const MAX_Y = 75;

/**
 * Get slot preference order for an overlay type, reordered to avoid
 * the focal point. Slots near the focal point are pushed to the end.
 */
function slotOrder(type: OverlayType, focalPoint?: FocalPoint): string[] {
  let base: string[];
  if (type === "dialogue") base = DIALOGUE_SLOTS;
  else if (type === "narration") base = NARRATION_SLOTS;
  else base = CAPTION_SLOTS;

  if (!focalPoint) return base;

  const avoid = FOCAL_AVOID[focalPoint];
  if (!avoid) return base;

  // Preferred (far from focal) first, then avoided (near focal) as fallback
  const preferred = base.filter((s) => !avoid.has(s));
  const fallback = base.filter((s) => avoid.has(s));
  return [...preferred, ...fallback];
}

/**
 * Compute a fixed maxWidthPercent based on text length and overlay type.
 */
function computeWidth(
  text: string,
  type: OverlayType,
  overlayCount: number
): number {
  const len = text.length;
  let width: number;

  if (type === "dialogue") {
    if (len < 40) width = 30;
    else if (len < 80) width = 38;
    else width = 46;
  } else if (type === "narration") {
    if (len < 40) width = 35;
    else if (len < 80) width = 42;
    else width = 50;
  } else {
    // caption
    if (len < 30) width = 25;
    else if (len < 60) width = 32;
    else width = 40;
  }

  // Scale down for crowded panels (4+ overlays)
  if (overlayCount >= 5) {
    width = Math.round(width * 0.8);
  } else if (overlayCount >= 4) {
    width = Math.round(width * 0.9);
  }

  return width;
}

interface BBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function estimateBBox(
  slot: Slot,
  widthPct: number,
  text: string
): BBox {
  const charsPerLine = Math.max(8, Math.round((widthPct / 100) * 35));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const heightPct = Math.min(35, lines * 6 + 5);

  let left: number;

  if (slot.anchor === "top-left" || slot.anchor === "bottom-left") {
    left = slot.x;
  } else if (slot.anchor === "top-right" || slot.anchor === "bottom-right") {
    left = slot.x - widthPct;
  } else {
    left = slot.x - widthPct / 2;
  }

  const top = slot.y;

  return {
    left: left - BBOX_PADDING,
    top: top - BBOX_PADDING,
    right: left + widthPct + BBOX_PADDING,
    bottom: top + heightPct + BBOX_PADDING,
  };
}

function bboxOverlap(a: BBox, b: BBox): boolean {
  return !(
    a.right <= b.left ||
    b.right <= a.left ||
    a.bottom <= b.top ||
    b.bottom <= a.top
  );
}

function overlapsAny(candidate: BBox, placed: BBox[]): boolean {
  for (const existing of placed) {
    if (bboxOverlap(candidate, existing)) return true;
  }
  return false;
}

/**
 * Place overlays for a single panel.
 * Uses focalPoint to vary placement — text is placed AWAY from the
 * main subject, creating natural variety across panels.
 *
 * Mutates overlay x, y, anchor, maxWidthPercent in place and returns them.
 */
export function placeOverlays(
  overlays: TextOverlay[],
  _layout: PanelLayout,
  focalPoint?: FocalPoint
): TextOverlay[] {
  if (overlays.length === 0) return overlays;

  const placedBoxes: BBox[] = [];
  const assignments: { overlay: TextOverlay; slotId: string; bbox: BBox }[] =
    [];

  // Sort: dialogues first, then narrations, then captions
  const typePriority: Record<OverlayType, number> = {
    dialogue: 0,
    narration: 1,
    caption: 2,
  };
  const sorted = [...overlays].sort(
    (a, b) => typePriority[a.type] - typePriority[b.type]
  );

  const used = new Set<string>();

  for (const overlay of sorted) {
    const preferred = slotOrder(overlay.type, focalPoint);
    const width = computeWidth(overlay.text, overlay.type, overlays.length);

    let bestSlotId: string | null = null;
    let bestBBox: BBox | null = null;

    // Find first preferred slot where bbox doesn't overlap anything placed
    for (const slotId of preferred) {
      if (used.has(slotId)) continue;
      const bbox = estimateBBox(SLOTS[slotId], width, overlay.text);
      if (!overlapsAny(bbox, placedBoxes)) {
        bestSlotId = slotId;
        bestBBox = bbox;
        break;
      }
    }

    // Fallback: any unused slot without overlap
    if (!bestSlotId) {
      for (const slotId of Object.keys(SLOTS)) {
        if (used.has(slotId)) continue;
        const bbox = estimateBBox(SLOTS[slotId], width, overlay.text);
        if (!overlapsAny(bbox, placedBoxes)) {
          bestSlotId = slotId;
          bestBBox = bbox;
          break;
        }
      }
    }

    // Still nothing? Take first unused preferred slot even if it overlaps
    if (!bestSlotId) {
      for (const slotId of preferred) {
        if (!used.has(slotId)) {
          bestSlotId = slotId;
          bestBBox = estimateBBox(SLOTS[slotId], width, overlay.text);
          break;
        }
      }
    }

    // Last resort: any unused slot
    if (!bestSlotId) {
      for (const slotId of Object.keys(SLOTS)) {
        if (!used.has(slotId)) {
          bestSlotId = slotId;
          bestBBox = estimateBBox(SLOTS[slotId], width, overlay.text);
          break;
        }
      }
    }

    // Absolute last resort (>8 overlays): reuse TL
    if (!bestSlotId) {
      bestSlotId = "TL";
      bestBBox = estimateBBox(SLOTS.TL, width, overlay.text);
    }

    used.add(bestSlotId);
    const slot = SLOTS[bestSlotId];

    overlay.x = slot.x;
    overlay.y = slot.y;
    overlay.anchor = slot.anchor;
    overlay.maxWidthPercent = width;

    placedBoxes.push(bestBBox!);
    assignments.push({ overlay, slotId: bestSlotId, bbox: bestBBox! });
  }

  // Safety-net collision resolution
  for (let pass = 0; pass < 5; pass++) {
    let anyNudged = false;
    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        if (!bboxOverlap(assignments[i].bbox, assignments[j].bbox)) continue;

        const overlapX = Math.min(
          assignments[i].bbox.right - assignments[j].bbox.left,
          assignments[j].bbox.right - assignments[i].bbox.left
        );
        const overlapY = Math.min(
          assignments[i].bbox.bottom - assignments[j].bbox.top,
          assignments[j].bbox.bottom - assignments[i].bbox.top
        );

        if (overlapX < overlapY) {
          const nudge = overlapX + 3;
          const dir =
            assignments[j].bbox.left > assignments[i].bbox.left ? 1 : -1;
          assignments[j].overlay.x += nudge * dir;
          assignments[j].bbox.left += nudge * dir;
          assignments[j].bbox.right += nudge * dir;
        } else {
          const nudge = overlapY + 3;
          const dir =
            assignments[j].bbox.top < assignments[i].bbox.top ? -1 : 1;
          const newY = assignments[j].overlay.y + nudge * dir;
          const clampedY = Math.max(MIN_Y, Math.min(MAX_Y, newY));
          const actualNudge = clampedY - assignments[j].overlay.y;

          assignments[j].overlay.y = clampedY;
          assignments[j].bbox.top += actualNudge;
          assignments[j].bbox.bottom += actualNudge;
        }
        anyNudged = true;
      }
    }
    if (!anyNudged) break;
  }

  return overlays;
}
