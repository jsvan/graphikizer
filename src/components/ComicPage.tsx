"use client";

import type { ComicPage as ComicPageType, PanelMargins } from "@/lib/types";
import ComicPanel from "./ComicPanel";

interface ComicPageProps {
  page: ComicPageType;
  editable?: boolean;
  onOverlayPositionChange?: (panelIndex: number, overlayIndex: number, x: number, y: number) => void;
  onOverlayResize?: (panelIndex: number, overlayIndex: number, maxWidthPercent: number) => void;
  onPanelMarginChange?: (panelIndex: number, margins: PanelMargins) => void;
}

export default function ComicPage({ page, editable, onOverlayPositionChange, onOverlayResize, onPanelMarginChange }: ComicPageProps) {
  return (
    <div className="w-full max-w-[1728px] mx-auto">
      <div
        className="comic-grid grid gap-3 bg-black p-4"
        style={{
          gridTemplateColumns: "repeat(6, 190px)",
          justifyContent: "center",
          gridAutoFlow: "dense",
          gridAutoRows: "minmax(180px, auto)",
          overflow: "visible",
        }}
      >
        {page.panels.map((panel) => (
          <ComicPanel
            key={panel.panelIndex}
            panel={panel}
            editable={editable}
            onOverlayPositionChange={
              onOverlayPositionChange
                ? (overlayIndex, x, y) => onOverlayPositionChange(panel.panelIndex, overlayIndex, x, y)
                : undefined
            }
            onOverlayResize={
              onOverlayResize
                ? (overlayIndex, mw) => onOverlayResize(panel.panelIndex, overlayIndex, mw)
                : undefined
            }
            onPanelMarginChange={
              onPanelMarginChange
                ? (margins) => onPanelMarginChange(panel.panelIndex, margins)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
