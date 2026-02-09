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
 * This is approximate — used only for collision nudging.
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
  // Estimate height based on characters and width
  // Rough: each line ~15 chars at width 30%, with each line ~5% of panel height
  const charsPerLine = Math.max(10, Math.round((widthPct / 100) * 40));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const heightPct = Math.min(30, lines * 5 + 4);

  let left: number, top: number;

  // Horizontal positioning based on anchor
  if (
    slot.anchor === "top-left" ||
    slot.anchor === "bottom-left"
  ) {
    left = slot.x;
  } else if (
    slot.anchor === "top-right" ||
    slot.anchor === "bottom-right"
  ) {
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

  return {
    left,
    top,
    right: left + widthPct,
    bottom: top + heightPct,
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
 * Place overlays for a single panel.
 * Assigns each overlay to a perimeter slot, computes fixed width,
 * and nudges overlapping boxes.
 *
 * Mutates overlay x, y, anchor, maxWidthPercent in place and returns them.
 */
export function placeOverlays(
  overlays: TextOverlay[],
  _layout: PanelLayout
): TextOverlay[] {
  if (overlays.length === 0) return overlays;

  const used = new Set<string>();
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

  for (const overlay of sorted) {
    const preferred = slotOrder(overlay.type);
    const width = computeWidth(overlay.text, overlay.type, overlays.length);

    let assignedSlotId: string | null = null;

    // Find first unused preferred slot
    for (const slotId of preferred) {
      if (!used.has(slotId)) {
        assignedSlotId = slotId;
        break;
      }
    }

    // Fallback: any unused slot
    if (!assignedSlotId) {
      for (const slotId of Object.keys(SLOTS)) {
        if (!used.has(slotId)) {
          assignedSlotId = slotId;
          break;
        }
      }
    }

    // Last resort: reuse TL (shouldn't happen with <=8 overlays)
    if (!assignedSlotId) {
      assignedSlotId = "TL";
    }

    used.add(assignedSlotId);
    const slot = SLOTS[assignedSlotId];
    const bbox = estimateBBox(slot, width, overlay.text);

    overlay.x = slot.x;
    overlay.y = slot.y;
    overlay.anchor = slot.anchor;
    overlay.maxWidthPercent = width;

    assignments.push({ overlay, slotId: assignedSlotId, bbox });
  }

  // Collision resolution: nudge overlapping boxes iteratively
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        if (bboxOverlap(assignments[i].bbox, assignments[j].bbox)) {
          // Nudge the later one down by the overlap amount + a small margin
          const overlapY =
            assignments[i].bbox.bottom - assignments[j].bbox.top + 3;
          assignments[j].overlay.y += overlapY;
          assignments[j].bbox.top += overlapY;
          assignments[j].bbox.bottom += overlapY;
        }
      }
    }
  }

  return overlays;
}
