"use client";

import React, { useEffect, useRef } from "react";
import { GlassArtifact } from "./GlassArtifact";

/**
 * The glass artifact, lightly interactive: it turns toward the pointer as it
 * moves anywhere on the page — like tilting a real crystal to catch the light —
 * on top of its ambient float. No WebGL, just a perspective transform driven by
 * a pointer listener. Respects reduced-motion.
 */
export function InteractiveGlass() {
  const hostRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let tx = 0, ty = 0, rx = 0, ry = 0, s = 1;

    function onMove(e: PointerEvent) {
      const host = hostRef.current;
      if (!host || mq.matches) return;
      const r = host.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const px = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth * 0.55)));
      const py = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight * 0.55)));
      ry = px * 15;
      rx = -py * 13;
      tx = px * 12;
      ty = py * 12;
      s = 1 + Math.min(0.06, Math.hypot(px, py) * 0.05);
      if (!raf) raf = requestAnimationFrame(apply);
    }

    function apply() {
      raf = 0;
      const el = tiltRef.current;
      if (!el) return;
      el.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(
        2
      )}deg) translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={hostRef} className="[perspective:1100px]">
      <div
        ref={tiltRef}
        className="transition-transform duration-500 ease-out will-change-transform"
      >
        <div className="animate-glass-float">
          <GlassArtifact />
        </div>
      </div>
    </div>
  );
}
