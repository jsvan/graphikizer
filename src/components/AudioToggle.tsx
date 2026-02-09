"use client";

interface AudioToggleProps {
  audioMode: boolean;
  onToggle: () => void;
}

export default function AudioToggle({ audioMode, onToggle }: AudioToggleProps) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded transition-colors bg-gray-800 hover:bg-gray-700"
      title={audioMode ? "Switch to text-only mode" : "Switch to audio mode"}
    >
      <span className={audioMode ? "text-amber-400" : "text-gray-400"}>
        {audioMode ? "Audio Mode" : "Text Only"}
      </span>
      <div
        className={`relative w-8 h-4 rounded-full transition-colors ${
          audioMode ? "bg-amber-400" : "bg-gray-600"
        }`}
      >
        <div
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
            audioMode ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </div>
    </button>
  );
}
