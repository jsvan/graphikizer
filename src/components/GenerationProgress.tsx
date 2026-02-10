"use client";

import { useState } from "react";
import type { GenerationStage } from "@/lib/types";

interface GenerationProgressProps {
  stage: GenerationStage;
  currentPanel: number;
  totalPanels: number;
  errorMessage?: string;
  scriptPreview?: object | null;
  latestImageUrl?: string;
  scriptChunkProgress?: string;
  currentVoice?: number;
  totalVoices?: number;
  voiceSubStage?: "describing" | "creating" | "speaking";
}

export default function GenerationProgress({
  stage,
  currentPanel,
  totalPanels,
  errorMessage,
  scriptPreview,
  latestImageUrl,
  scriptChunkProgress,
  currentVoice = 0,
  totalVoices = 0,
  voiceSubStage,
}: GenerationProgressProps) {
  const [scriptExpanded, setScriptExpanded] = useState(false);

  if (stage === "idle" || stage === "partial") return null;

  const panelProgress = totalPanels > 0 ? (currentPanel / totalPanels) * 100 : 0;

  return (
    <div className="w-full max-w-xl mx-auto mt-8 space-y-4">
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
        {stage === "script" && (
          <div className="text-center">
            <div className="animate-pulse text-amber-400 text-lg font-semibold mb-2">
              Generating Script{scriptChunkProgress ? ` (${scriptChunkProgress})` : ""}...
            </div>
            <p className="text-gray-400 text-sm">
              AI is reading the article section by section and creating a graphic novel script.
            </p>
          </div>
        )}

        {stage === "editing" && (
          <div className="text-center">
            <div className="animate-pulse text-amber-400 text-lg font-semibold mb-2">
              Editing Script...
            </div>
            <p className="text-gray-400 text-sm">
              AI editor is tightening narration and converting indirect speech to dialogue.
            </p>
          </div>
        )}

        {stage === "panels" && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-amber-400 font-semibold">
                Generating Artwork
              </span>
              <span className="text-gray-400 text-sm font-mono">
                {currentPanel} / {totalPanels}
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-amber-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${panelProgress}%` }}
              />
            </div>
            <p className="text-gray-500 text-xs mt-2">
              Each panel takes ~10-15 seconds. Generating 5 panels at a time.
            </p>
          </div>
        )}

        {stage === "voices" && voiceSubStage === "describing" && (
          <div className="text-center">
            <div className="animate-pulse text-amber-400 text-lg font-semibold mb-2">
              Describing Voices...
            </div>
            <p className="text-gray-400 text-sm">
              Analyzing characters and generating voice descriptions.
            </p>
          </div>
        )}

        {stage === "voices" && voiceSubStage === "creating" && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-amber-400 font-semibold">
                Creating Voice Profiles
              </span>
              <span className="text-gray-400 text-sm font-mono">
                {currentVoice} / {totalVoices}
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-amber-400 h-full rounded-full transition-all duration-300"
                style={{
                  width: `${totalVoices > 0 ? (currentVoice / totalVoices) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-gray-500 text-xs mt-2">
              Designing custom voices with ElevenLabs Voice Design.
            </p>
          </div>
        )}

        {stage === "voices" && voiceSubStage === "speaking" && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-amber-400 font-semibold">
                Generating Speech
              </span>
              <span className="text-gray-400 text-sm font-mono">
                {currentVoice} / {totalVoices}
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-amber-400 h-full rounded-full transition-all duration-300"
                style={{
                  width: `${totalVoices > 0 ? (currentVoice / totalVoices) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-gray-500 text-xs mt-2">
              Converting dialogue to speech with ElevenLabs. 5 at a time.
            </p>
          </div>
        )}

        {stage === "saving" && (
          <div className="text-center">
            <div className="animate-pulse text-amber-400 text-lg font-semibold mb-2">
              Saving Article...
            </div>
            <p className="text-gray-400 text-sm">Almost done!</p>
          </div>
        )}

        {stage === "done" && (
          <div className="text-center">
            <div className="text-green-400 text-lg font-semibold mb-2">
              Complete!
            </div>
            <p className="text-gray-400 text-sm">Redirecting to your graphic novel...</p>
          </div>
        )}

        {stage === "error" && (
          <div className="text-center">
            <div className="text-red-400 text-lg font-semibold mb-2">Error</div>
            <p className="text-gray-400 text-sm">{errorMessage || "Something went wrong"}</p>
          </div>
        )}
      </div>

      {/* Preview window */}
      {(scriptPreview || latestImageUrl) && (
        <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
            Latest AI Output
          </h3>

          {/* Latest image */}
          {latestImageUrl && (
            <div className="mb-3">
              <img
                src={latestImageUrl}
                alt={`Panel ${currentPanel}`}
                className="w-full max-h-64 object-contain rounded-lg bg-gray-800"
              />
              <p className="text-xs text-gray-500 mt-1 text-center">
                Panel {currentPanel} of {totalPanels}
              </p>
            </div>
          )}

          {/* Script JSON */}
          {scriptPreview && (
            <div>
              <button
                onClick={() => setScriptExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-amber-400 transition-colors"
              >
                <svg
                  className={`w-3 h-3 transition-transform ${scriptExpanded ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Script JSON
              </button>
              {scriptExpanded && (
                <pre className="mt-2 p-3 bg-gray-950 rounded-lg text-xs text-gray-300 overflow-auto max-h-80 font-mono leading-relaxed">
                  {JSON.stringify(scriptPreview, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
