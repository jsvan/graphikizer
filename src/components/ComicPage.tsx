"use client";

import type { ComicPage as ComicPageType } from "@/lib/types";
import ComicPanel from "./ComicPanel";

interface ComicPageProps {
  page: ComicPageType;
}

export default function ComicPage({ page }: ComicPageProps) {
  return (
    <div className="w-full max-w-6xl mx-auto">
      <div
        className="comic-grid grid gap-1 bg-black p-1"
        style={{
          gridTemplateColumns: "repeat(6, 1fr)",
          gridAutoFlow: "dense",
          gridAutoRows: "minmax(180px, auto)",
        }}
      >
        {page.panels.map((panel) => (
          <ComicPanel key={panel.panelIndex} panel={panel} />
        ))}
      </div>
    </div>
  );
}
