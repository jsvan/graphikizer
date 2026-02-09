"use client";

interface PanelSummary {
  panelIndex: number;
  imageUrl?: string;
}

export interface FailedItems {
  panels: number[];
  speakers: string[];
  ttsCount: number;
}

interface RetryCarouselProps {
  panels: PanelSummary[];
  failedItems: FailedItems;
  onRetry: () => void;
}

export default function RetryCarousel({
  panels,
  failedItems,
  onRetry,
}: RetryCarouselProps) {
  const failedPanelSet = new Set(failedItems.panels);
  const totalFailed =
    failedItems.panels.length +
    failedItems.speakers.length +
    failedItems.ttsCount;

  return (
    <div className="w-full max-w-xl mx-auto mt-8">
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
        <h3 className="text-amber-400 text-lg font-semibold mb-4">
          Generation Incomplete
        </h3>

        {/* Panel thumbnail carousel */}
        {panels.length > 0 && (
          <div className="overflow-x-auto pb-2 mb-4 scrollbar-thin">
            <div className="flex gap-2 min-w-min">
              {panels.map((panel) => {
                const failed = failedPanelSet.has(panel.panelIndex);
                return (
                  <div
                    key={panel.panelIndex}
                    className={`relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border ${
                      failed
                        ? "border-red-500/50"
                        : "border-gray-700"
                    }`}
                  >
                    {panel.imageUrl && !failed ? (
                      <img
                        src={panel.imageUrl}
                        alt={`Panel ${panel.panelIndex + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-800">
                        <span
                          className={`text-xs font-mono ${
                            failed ? "text-red-400" : "text-gray-600"
                          }`}
                        >
                          {panel.panelIndex + 1}
                        </span>
                      </div>
                    )}
                    {failed && (
                      <div className="absolute inset-0 bg-gray-900/60 flex items-center justify-center">
                        <svg
                          className="w-5 h-5 text-red-400"
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Failure summary */}
        <div className="text-sm text-gray-400 mb-4 space-y-1">
          {failedItems.panels.length > 0 && (
            <p>
              {failedItems.panels.length} panel image
              {failedItems.panels.length > 1 ? "s" : ""} failed
            </p>
          )}
          {failedItems.speakers.length > 0 && (
            <p>
              {failedItems.speakers.length} voice profile
              {failedItems.speakers.length > 1 ? "s" : ""} failed:{" "}
              {failedItems.speakers.join(", ")}
            </p>
          )}
          {failedItems.ttsCount > 0 && (
            <p>
              {failedItems.ttsCount} voice clip
              {failedItems.ttsCount > 1 ? "s" : ""} failed
            </p>
          )}
        </div>

        {/* Retry button */}
        <button
          onClick={onRetry}
          className="w-full py-3 bg-amber-500 text-gray-900 font-bold rounded-lg hover:bg-amber-400 transition-colors"
        >
          Click to Retry {totalFailed} Failed Item
          {totalFailed > 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}
