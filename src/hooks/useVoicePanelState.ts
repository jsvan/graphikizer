"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type VoiceState = "idle" | "loading" | "playing";

interface UseVoicePanelStateReturn {
  activeOverlay: number | null;
  voiceState: VoiceState;
  play: (overlayIndex: number, audioUrl: string) => void;
  stop: () => void;
}

const MIN_DISPLAY_MS = 1000;

export function useVoicePanelState(): UseVoicePanelStateReturn {
  const [activeOverlay, setActiveOverlay] = useState<number | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playStartRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setActiveOverlay(null);
    setVoiceState("idle");
  }, [cleanup]);

  const play = useCallback(
    (overlayIndex: number, audioUrl: string) => {
      // Stop any currently playing audio
      cleanup();

      setActiveOverlay(overlayIndex);
      setVoiceState("loading");

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      playStartRef.current = Date.now();

      audio.addEventListener("canplaythrough", () => {
        if (audioRef.current !== audio) return; // stale
        setVoiceState("playing");
        audio.play().catch(() => {
          // Autoplay blocked — still show the bubble for min duration
          timerRef.current = setTimeout(() => {
            setActiveOverlay(null);
            setVoiceState("idle");
          }, MIN_DISPLAY_MS);
        });
      });

      audio.addEventListener("ended", () => {
        if (audioRef.current !== audio) return; // stale
        const elapsed = Date.now() - playStartRef.current;
        const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
        timerRef.current = setTimeout(() => {
          setActiveOverlay(null);
          setVoiceState("idle");
          audioRef.current = null;
        }, remaining);
      });

      audio.addEventListener("error", () => {
        if (audioRef.current !== audio) return;
        // On error, show bubble briefly then hide
        timerRef.current = setTimeout(() => {
          setActiveOverlay(null);
          setVoiceState("idle");
          audioRef.current = null;
        }, MIN_DISPLAY_MS);
      });
    },
    [cleanup]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { activeOverlay, voiceState, play, stop };
}
