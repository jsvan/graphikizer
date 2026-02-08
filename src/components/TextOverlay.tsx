"use client";

import { useRef, useCallback } from "react";
import type { TextOverlay as TextOverlayType } from "@/lib/types";

interface TextOverlayProps {
  overlay: TextOverlayType;
  editable?: boolean;
  onPositionChange?: (x: number, y: number) => void;
}

export default function TextOverlay({ overlay, editable, onPositionChange }: TextOverlayProps) {
  const { type, text, x, y, anchor, maxWidthPercent = 40, speaker } = overlay;
  const elRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    const el = elRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    dragState.current = {
      startX: e.clientX - el.offsetLeft,
      startY: e.clientY - el.offsetTop,
    };
    el.setPointerCapture(e.pointerId);
  }, [editable]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !editable) return;
    const el = elRef.current;
    if (!el || !el.parentElement) return;
    e.preventDefault();

    const parent = el.parentElement;
    let newLeft = e.clientX - dragState.current.startX;
    let newTop = e.clientY - dragState.current.startY;

    // Clamp to parent bounds
    newLeft = Math.max(0, Math.min(newLeft, parent.clientWidth - el.offsetWidth));
    newTop = Math.max(0, Math.min(newTop, parent.clientHeight - el.offsetHeight));

    el.style.left = `${newLeft}px`;
    el.style.top = `${newTop}px`;
    // Override any right/bottom/transform that anchor positioning may have set
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.transform = "none";
  }, [editable]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current || !editable) return;
    const el = elRef.current;
    if (!el || !el.parentElement) return;

    el.releasePointerCapture(e.pointerId);

    const parent = el.parentElement;
    const xPercent = (el.offsetLeft / parent.clientWidth) * 100;
    const yPercent = (el.offsetTop / parent.clientHeight) * 100;

    dragState.current = null;
    onPositionChange?.(
      Math.round(xPercent * 100) / 100,
      Math.round(yPercent * 100) / 100
    );
  }, [editable, onPositionChange]);

  const positionStyle: React.CSSProperties = {
    position: "absolute",
    maxWidth: `${maxWidthPercent}%`,
    zIndex: 10,
  };

  if (editable) {
    // In edit mode always use top-left positioning for consistent drag math
    positionStyle.left = `${x}%`;
    positionStyle.top = `${y}%`;
    positionStyle.cursor = "grab";
    positionStyle.touchAction = "none";
  } else {
    // Position based on anchor
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
          {/* Speech bubble tail */}
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
