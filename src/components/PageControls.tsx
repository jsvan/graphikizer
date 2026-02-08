"use client";

interface PageControlsProps {
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function PageControls({
  currentPage,
  totalPages,
  onPrev,
  onNext,
}: PageControlsProps) {
  return (
    <div className="flex items-center justify-center gap-6 py-6">
      <button
        onClick={onPrev}
        disabled={currentPage === 0}
        className="px-5 py-2.5 bg-gray-800 text-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors font-medium"
      >
        &larr; Prev
      </button>

      <span className="text-gray-400 text-sm font-mono">
        Page {currentPage + 1} of {totalPages}
      </span>

      <button
        onClick={onNext}
        disabled={currentPage === totalPages - 1}
        className="px-5 py-2.5 bg-gray-800 text-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors font-medium"
      >
        Next &rarr;
      </button>
    </div>
  );
}
