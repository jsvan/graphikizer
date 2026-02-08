"use client";

import { useState, useEffect, useCallback } from "react";
import type { ArticleManifest, PanelMargins } from "@/lib/types";
import ComicPage from "./ComicPage";
import PageControls from "./PageControls";

interface ComicReaderProps {
  manifest: ArticleManifest;
}

export default function ComicReader({ manifest }: ComicReaderProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [editedManifest, setEditedManifest] = useState<ArticleManifest | null>(null);
  const [baseManifest, setBaseManifest] = useState<ArticleManifest>(manifest);
  const [hasChanges, setHasChanges] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const totalPages = baseManifest.pages.length;

  const activeManifest = editedManifest ?? baseManifest;

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

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => {
      if (!prev) {
        // Entering edit mode — deep copy from baseManifest
        setEditedManifest(JSON.parse(JSON.stringify(baseManifest)));
        setHasChanges(false);
        setSaveError("");
        setSaveSuccess(false);
      } else {
        // Exiting edit mode — discard unsaved changes, fall back to baseManifest
        setEditedManifest(null);
        setHasChanges(false);
        setSaveError("");
        setSaveSuccess(false);
      }
      return !prev;
    });
  }, [baseManifest]);

  const handleOverlayPositionChange = useCallback(
    (panelIndex: number, overlayIndex: number, x: number, y: number) => {
      setEditedManifest((prev) => {
        if (!prev) return prev;
        const updated = JSON.parse(JSON.stringify(prev)) as ArticleManifest;
        const page = updated.pages[currentPage];
        const panel = page.panels.find((p) => p.panelIndex === panelIndex);
        if (panel && panel.overlays[overlayIndex]) {
          panel.overlays[overlayIndex].x = x;
          panel.overlays[overlayIndex].y = y;
          panel.overlays[overlayIndex].anchor = "top-left";
        }
        return updated;
      });
      setHasChanges(true);
      setSaveSuccess(false);
    },
    [currentPage]
  );

  const handleOverlayResize = useCallback(
    (panelIndex: number, overlayIndex: number, maxWidthPercent: number) => {
      setEditedManifest((prev) => {
        if (!prev) return prev;
        const updated = JSON.parse(JSON.stringify(prev)) as ArticleManifest;
        const page = updated.pages[currentPage];
        const panel = page.panels.find((p) => p.panelIndex === panelIndex);
        if (panel && panel.overlays[overlayIndex]) {
          panel.overlays[overlayIndex].maxWidthPercent = maxWidthPercent;
        }
        return updated;
      });
      setHasChanges(true);
      setSaveSuccess(false);
    },
    [currentPage]
  );

  const handlePanelMarginChange = useCallback(
    (panelIndex: number, margins: PanelMargins) => {
      setEditedManifest((prev) => {
        if (!prev) return prev;
        const updated = JSON.parse(JSON.stringify(prev)) as ArticleManifest;
        const page = updated.pages[currentPage];
        const panel = page.panels.find((p) => p.panelIndex === panelIndex);
        if (panel) {
          panel.panelMargins = margins;
        }
        return updated;
      });
      setHasChanges(true);
      setSaveSuccess(false);
    },
    [currentPage]
  );

  const handleSave = useCallback(async () => {
    if (!editedManifest || !password) return;
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/save-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest: editedManifest, password }),
      });
      const data = await res.json();
      if (!data.success) {
        setSaveError(data.error || "Save failed");
      } else {
        setSaveSuccess(true);
        setHasChanges(false);
        // Update baseManifest so exiting edit mode preserves saved positions
        setBaseManifest(JSON.parse(JSON.stringify(editedManifest)));
      }
    } catch {
      setSaveError("Network error");
    } finally {
      setSaving(false);
    }
  }, [editedManifest, password]);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="max-w-[1728px] mx-auto px-4 pt-8 pb-4">
        <div className="flex items-center justify-between">
          <a
            href="/"
            className="text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors"
          >
            &larr; Back to articles
          </a>
          <button
            onClick={toggleEditMode}
            className={`text-sm font-medium px-3 py-1.5 rounded transition-colors ${
              editMode
                ? "bg-amber-400 text-gray-900 hover:bg-amber-300"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {editMode ? "Exit Edit Mode" : "Edit Overlays"}
          </button>
        </div>
        <h1 className="text-3xl font-bold text-gray-100 mt-3">{activeManifest.title}</h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
          <span className="text-amber-400/80">{activeManifest.artStyle.name}</span>
          <span>&middot;</span>
          <span>{activeManifest.totalPanels} panels</span>
          <span>&middot;</span>
          <span>{totalPages} pages</span>
          {editMode && (
            <>
              <span>&middot;</span>
              <span className="text-amber-400 font-medium">Editing</span>
            </>
          )}
          {activeManifest.sourceUrl && (
            <>
              <span>&middot;</span>
              <a
                href={activeManifest.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400/60 hover:text-amber-400 transition-colors"
              >
                Original article &nearr;
              </a>
            </>
          )}
          {activeManifest.scriptUrl && (
            <>
              <span>&middot;</span>
              <a
                href={activeManifest.scriptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400/60 hover:text-amber-400 transition-colors"
              >
                AI script &nearr;
              </a>
            </>
          )}
        </div>
      </div>

      {/* Edit mode save bar */}
      {editMode && hasChanges && (
        <div className="max-w-[1728px] mx-auto px-4 pb-4">
          <div className="flex items-center gap-3 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-400"
            />
            <button
              onClick={handleSave}
              disabled={saving || !password}
              className="bg-amber-400 text-gray-900 font-medium text-sm px-4 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : "Save Positions"}
            </button>
            {saveError && <span className="text-red-400 text-sm">{saveError}</span>}
            {saveSuccess && <span className="text-green-400 text-sm">Saved!</span>}
          </div>
        </div>
      )}

      {/* Page controls top */}
      <PageControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPrev={goToPrev}
        onNext={goToNext}
      />

      {/* Comic page */}
      <div className="px-4">
        <ComicPage
          page={activeManifest.pages[currentPage]}
          editable={editMode}
          onOverlayPositionChange={editMode ? handleOverlayPositionChange : undefined}
          onOverlayResize={editMode ? handleOverlayResize : undefined}
          onPanelMarginChange={editMode ? handlePanelMarginChange : undefined}
        />
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
