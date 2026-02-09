import type { TextOverlay, PanelLayout, OverlayType } from "./types";

/**
 * Slot-based bubble placement system for comic panels.
 *
 * Places overlays around the panel perimeter, keeping the center 50%
 * (the "sacrosanct zone") clear so the focal artwork is visible.
 */

interface Slot {
  id: string;
  x: number;
  y: number;
  anchor: TextOverlay["anchor"];
}

// 8 placement slots around the panel perimeter.
// Coordinates are percentages; some go slightly negative or past 100
// to sit in the gutter between panels.
const SLOTS: Record<string, Slot> = {
  TL: { id: "TL", x: 3, y: 3, anchor: "top-left" },
  TC: { id: "TC", x: 50, y: -2, anchor: "center" },
  TR: { id: "TR", x: 97, y: 3, anchor: "top-right" },
  ML: { id: "ML", x: -3, y: 40, anchor: "top-left" },
  MR: { id: "MR", x: 103, y: 40, anchor: "top-right" },
  BL: { id: "BL", x: 3, y: 78, anchor: "bottom-left" },
  BC: { id: "BC", x: 50, y: 102, anchor: "center" },
  BR: { id: "BR", x: 97, y: 78, anchor: "bottom-right" },
};

// Preferred slot order per overlay type
const DIALOGUE_SLOTS = ["TL", "TR", "ML", "MR", "BL", "BR"];
const NARRATION_SLOTS = ["TL", "BL", "BR", "TR", "TC", "BC"];
const CAPTION_SLOTS = ["TC", "BC", "TL", "BL", "TR", "BR"];

/** Padding added to each side of estimated bounding boxes (in %) */
const BBOX_PADDING = 4;

function slotOrder(type: OverlayType): string[] {
  if (type === "dialogue") return DIALOGUE_SLOTS;
  if (type === "narration") return NARRATION_SLOTS;
  return CAPTION_SLOTS;
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

/**
 * Estimate a bounding box (in % coordinates) for an overlay at a given slot.
 * Includes padding on all sides so near-misses are treated as overlaps.
 */
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
  // Estimate height: ~12 chars per line at 30% width, each line ~6% of panel height
  const charsPerLine = Math.max(8, Math.round((widthPct / 100) * 35));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const heightPct = Math.min(35, lines * 6 + 5);

  let left: number, top: number;

  // Horizontal positioning based on anchor
  if (slot.anchor === "top-left" || slot.anchor === "bottom-left") {
    left = slot.x;
  } else if (slot.anchor === "top-right" || slot.anchor === "bottom-right") {
    left = slot.x - widthPct;
  } else {
    // center
    left = slot.x - widthPct / 2;
  }

  // Vertical positioning based on anchor
  if (
    slot.anchor === "top-left" ||
    slot.anchor === "top-right" ||
    slot.anchor === "center"
  ) {
    top = slot.y;
  } else {
    // bottom-*
    top = slot.y - heightPct;
  }

  // Add padding on all sides
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

/**
 * Check if a candidate bbox overlaps any already-placed bbox.
 */
function overlapsAny(candidate: BBox, placed: BBox[]): boolean {
  for (const existing of placed) {
    if (bboxOverlap(candidate, existing)) return true;
  }
  return false;
}

/**
 * Place overlays for a single panel.
 * Assigns each overlay to a perimeter slot, checking for bbox overlap
 * during assignment (not just after). Computes fixed width and does
 * final collision resolution as a safety net.
 *
 * Mutates overlay x, y, anchor, maxWidthPercent in place and returns them.
 */
export function placeOverlays(
  overlays: TextOverlay[],
  _layout: PanelLayout
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
    const preferred = slotOrder(overlay.type);
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

    // Still nothing? Take first unused slot even if it overlaps
    // (collision resolution below will try to fix it)
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

  // Safety-net collision resolution: nudge any remaining overlaps
  for (let pass = 0; pass < 5; pass++) {
    let anyNudged = false;
    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        if (!bboxOverlap(assignments[i].bbox, assignments[j].bbox)) continue;

        // Determine whether to nudge horizontally or vertically
        // based on which overlap dimension is smaller (less displacement)
        const overlapX = Math.min(
          assignments[i].bbox.right - assignments[j].bbox.left,
          assignments[j].bbox.right - assignments[i].bbox.left
        );
        const overlapY = Math.min(
          assignments[i].bbox.bottom - assignments[j].bbox.top,
          assignments[j].bbox.bottom - assignments[i].bbox.top
        );

        if (overlapX < overlapY) {
          // Nudge horizontally — push j away from i
          const nudge = overlapX + 3;
          const dir =
            assignments[j].bbox.left > assignments[i].bbox.left ? 1 : -1;
          assignments[j].overlay.x += nudge * dir;
          assignments[j].bbox.left += nudge * dir;
          assignments[j].bbox.right += nudge * dir;
        } else {
          // Nudge vertically — push j down (or up if j is above i)
          const nudge = overlapY + 3;
          const dir =
            assignments[j].bbox.top > assignments[i].bbox.top ? 1 : -1;
          assignments[j].overlay.y += nudge * dir;
          assignments[j].bbox.top += nudge * dir;
          assignments[j].bbox.bottom += nudge * dir;
        }
        anyNudged = true;
      }
    }
    if (!anyNudged) break;
  }

  return overlays;
}
