"use client";

import type { PendingDecision, UserDecision } from "@/lib/types";

interface FailureDecisionProps {
  decision: PendingDecision;
  onDecision: (d: UserDecision) => void;
}

const SECTION_LABELS: Record<string, string> = {
  voice_creation: "Voice Creation",
  tts: "Audio Generation",
  panels: "Panel Generation",
};

export default function FailureDecision({
  decision,
  onDecision,
}: FailureDecisionProps) {
  const label = SECTION_LABELS[decision.section] || decision.section;

  return (
    <div className="w-full max-w-xl mx-auto mt-8">
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
        <h3 className="text-amber-400 text-lg font-semibold mb-1">
          {label} — Failures Detected
        </h3>
        <p className="text-gray-400 text-sm mb-4">
          {decision.succeededCount} of {decision.totalCount} succeeded.{" "}
          {decision.failedCount} failed.
        </p>

        {/* Scrollable list of failed items */}
        {decision.failedDetails.length > 0 && (
          <div className="mb-4 max-h-40 overflow-y-auto rounded-lg bg-gray-950 border border-gray-800 p-3">
            <ul className="space-y-1">
              {decision.failedDetails.map((detail, i) => (
                <li
                  key={i}
                  className="text-sm text-red-400 font-mono flex items-center gap-2"
                >
                  <svg
                    className="w-3.5 h-3.5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  {detail}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Contextual buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onDecision("retry")}
            className="w-full py-3 bg-amber-500 text-gray-900 font-bold rounded-lg hover:bg-amber-400 transition-colors"
          >
            Try Again
          </button>

          {decision.section === "panels" ? (
            <button
              onClick={() => onDecision("skip")}
              className="w-full py-2.5 bg-gray-800 text-gray-300 font-medium rounded-lg hover:bg-gray-700 transition-colors border border-gray-700"
            >
              Save As-Is
            </button>
          ) : (
            <>
              <button
                onClick={() => onDecision("skip")}
                className="w-full py-2.5 bg-gray-800 text-gray-300 font-medium rounded-lg hover:bg-gray-700 transition-colors border border-gray-700"
              >
                {decision.section === "voice_creation"
                  ? "Skip Failed Voices"
                  : "Skip Failed Clips"}
              </button>
              {(decision.section === "voice_creation" ||
                decision.section === "tts") && (
                <button
                  onClick={() => onDecision("skip_section")}
                  className="w-full py-2.5 bg-gray-800 text-gray-400 font-medium rounded-lg hover:bg-gray-700 transition-colors border border-gray-700"
                >
                  Skip All Audio
                </button>
              )}
              <button
                onClick={() => onDecision("terminate")}
                className="w-full py-2.5 bg-red-900/40 text-red-400 font-medium rounded-lg hover:bg-red-900/60 transition-colors border border-red-800/50"
              >
                Stop &amp; Save
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
