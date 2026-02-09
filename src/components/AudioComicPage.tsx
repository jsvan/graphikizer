"use client";

import type { ComicPage as ComicPageType, CharacterVoiceProfile } from "@/lib/types";
import AudioComicPanel from "./AudioComicPanel";

interface AudioComicPageProps {
  page: ComicPageType;
  voices: CharacterVoiceProfile[];
}

export default function AudioComicPage({ page, voices }: AudioComicPageProps) {
  return (
    <div className="w-full max-w-[1728px] mx-auto">
      <div
        className="comic-grid grid gap-6 bg-black p-12"
        style={{
          gridTemplateColumns: "repeat(6, 190px)",
          justifyContent: "center",
          gridAutoFlow: "dense",
          gridAutoRows: "minmax(180px, auto)",
          overflow: "visible",
        }}
      >
        {page.panels.map((panel) => (
          <AudioComicPanel
            key={panel.panelIndex}
            panel={panel}
            voices={voices}
          />
        ))}
      </div>
    </div>
  );
}
