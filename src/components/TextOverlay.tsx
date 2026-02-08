"use client";

import { useRef, useCallback } from "react";
import type { TextOverlay as TextOverlayType } from "@/lib/types";

interface TextOverlayProps {
  overlay: TextOverlayType;
  editable?: boolean;
  onPositionChange?: (x: number, y: number) => void;
  /** Render as static block below the image instead of absolute overlay */
  renderBelow?: boolean;
}

export default function TextOverlay({ overlay, editable, onPositionChange, renderBelow }: TextOverlayProps) {
  const { type, text, x, y, anchor, maxWidthPercent = 40, speaker } = overlay;
  const elRef = useRef<HTMLDivElement>(null);
  // startX/startY = pointer offset within element (pixels from element top-left)
  const dragState = useRef<{ offsetX: number; offsetY: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    const el = elRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = el.getBoundingClientRect();
    dragState.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
  }, [editable]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !editable) return;
    const el = elRef.current;
    if (!el || !el.parentElement) return;
    e.preventDefault();

    const parentRect = el.parentElement.getBoundingClientRect();
    let newLeft = e.clientX - dragState.current.offsetX - parentRect.left;
    let newTop = e.clientY - dragState.current.offsetY - parentRect.top;

    // Clamp to parent bounds
    newLeft = Math.max(0, Math.min(newLeft, parentRect.width - el.offsetWidth));
    newTop = Math.max(0, Math.min(newTop, parentRect.height - el.offsetHeight));

    el.style.left = `${newLeft}px`;
    el.style.top = `${newTop}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.transform = "none";
  }, [editable]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !editable) return;
    const el = elRef.current;
    if (!el || !el.parentElement) return;

    el.releasePointerCapture(e.pointerId);
    el.style.cursor = "grab";

    const parentRect = el.parentElement.getBoundingClientRect();
    const xPercent = (el.offsetLeft / parentRect.width) * 100;
    const yPercent = (el.offsetTop / parentRect.height) * 100;

    dragState.current = null;
    onPositionChange?.(
      Math.round(xPercent * 100) / 100,
      Math.round(yPercent * 100) / 100
    );
  }, [editable, onPositionChange]);

  // --- Below-image rendering (static flow, no absolute positioning) ---
  if (renderBelow) {
    if (type === "narration") {
      return (
        <div className="bg-black/90 border-l-2 border-amber-400 px-3 py-2 text-gray-100 text-sm italic leading-snug">
          {text}
        </div>
      );
    }
    // Captions below
    return (
      <div className="bg-black/90 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
        {text}
      </div>
    );
  }

  // --- Absolute overlay rendering ---
  const positionStyle: React.CSSProperties = {
    position: "absolute",
    maxWidth: `${maxWidthPercent}%`,
    zIndex: 10,
  };

  if (editable) {
    positionStyle.left = `${x}%`;
    positionStyle.top = `${y}%`;
    positionStyle.cursor = "grab";
    positionStyle.touchAction = "none";
  } else {
    if (anchor === "top-left" || anchor === "bottom-left") {
      positionStyle.left = `${x}%`;
    } else if (anchor === "top-right" || anchor === "bottom-right") {
      positionStyle.right = `${100 - x}%`;
    } else {
      positionStyle.left = `${x}%`;
      positionStyle.transform = "translateX(-50%)";
    }

    if (anchor === "top-left" || anchor === "top-right") {
      positionStyle.top = `${y}%`;
    } else if (anchor === "bottom-left" || anchor === "bottom-right") {
      positionStyle.bottom = `${100 - y}%`;
    } else {
      positionStyle.top = `${y}%`;
      positionStyle.transform = `${positionStyle.transform || ""} translateY(-50%)`.trim();
    }
  }

  const editableRing = editable ? " ring-2 ring-amber-400/50 ring-offset-1 ring-offset-transparent" : "";

  const pointerHandlers = editable
    ? { onPointerDown: handlePointerDown, onPointerMove: handlePointerMove, onPointerUp: handlePointerUp }
    : {};

  if (type === "narration") {
    return (
      <div
        ref={elRef}
        style={positionStyle}
        className={`bg-black/75 border-l-2 border-amber-400 px-3 py-2 text-gray-100 text-sm italic leading-snug${editableRing}`}
        {...pointerHandlers}
      >
        {text}
      </div>
    );
  }

  if (type === "dialogue") {
    return (
      <div
        ref={elRef}
        style={positionStyle}
        className={`flex flex-col items-start${editableRing}`}
        {...pointerHandlers}
      >
        {speaker && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-0.5 px-1">
            {speaker}
          </span>
        )}
        <div className="bg-white text-gray-900 rounded-lg px-3 py-2 text-sm leading-snug shadow-md relative">
          {text}
          <div className="absolute -bottom-1.5 left-4 w-3 h-3 bg-white rotate-45" />
        </div>
      </div>
    );
  }

  // Caption
  return (
    <div
      ref={elRef}
      style={positionStyle}
      className={`bg-black/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300${editableRing}`}
      {...pointerHandlers}
    >
      {text}
    </div>
  );
}
