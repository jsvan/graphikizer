"use client";

import { useState, useEffect, useCallback } from "react";
import type { ArticleManifest } from "@/lib/types";
import ComicPage from "./ComicPage";
import PageControls from "./PageControls";

interface ComicReaderProps {
  manifest: ArticleManifest;
}

export default function ComicReader({ manifest }: ComicReaderProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const totalPages = manifest.pages.length;

  const goToPrev = useCallback(() => {
    setCurrentPage((p) => Math.max(0, p - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentPage((p) => Math.min(totalPages - 1, p + 1));
  }, [totalPages]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goToPrev();
      if (e.key === "ArrowRight") goToNext();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPrev, goToNext]);

  // Scroll to top on page change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentPage]);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 pt-8 pb-4">
        <a
          href="/"
          className="text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors"
        >
          &larr; Back to articles
        </a>
        <h1 className="text-3xl font-bold text-gray-100 mt-3">{manifest.title}</h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
          <span className="text-amber-400/80">{manifest.artStyle.name}</span>
          <span>&middot;</span>
          <span>{manifest.totalPanels} panels</span>
          <span>&middot;</span>
          <span>{totalPages} pages</span>
          {manifest.sourceUrl && (
            <>
              <span>&middot;</span>
              <a
                href={manifest.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400/60 hover:text-amber-400 transition-colors"
              >
                Original article &nearr;
              </a>
            </>
          )}
        </div>
      </div>

      {/* Page controls top */}
      <PageControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPrev={goToPrev}
        onNext={goToNext}
      />

      {/* Comic page */}
      <div className="px-4">
        <ComicPage page={manifest.pages[currentPage]} />
      </div>

      {/* Page controls bottom */}
      <PageControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPrev={goToPrev}
        onNext={goToNext}
      />
    </div>
  );
}
