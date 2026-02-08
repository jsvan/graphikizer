"use client";

interface GenerationProgressProps {
  stage: "idle" | "script" | "panels" | "saving" | "done" | "error";
  currentPanel: number;
  totalPanels: number;
  errorMessage?: string;
}

export default function GenerationProgress({
  stage,
  currentPanel,
  totalPanels,
  errorMessage,
}: GenerationProgressProps) {
  if (stage === "idle") return null;

  const panelProgress = totalPanels > 0 ? (currentPanel / totalPanels) * 100 : 0;

  return (
    <div className="w-full max-w-xl mx-auto mt-8 p-6 bg-gray-900 rounded-xl border border-gray-800">
      {stage === "script" && (
        <div className="text-center">
          <div className="animate-pulse text-amber-400 text-lg font-semibold mb-2">
            Generating Script...
          </div>
          <p className="text-gray-400 text-sm">
            AI is reading the article and creating a graphic novel script.
            This takes about 30 seconds.
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
  );
}
