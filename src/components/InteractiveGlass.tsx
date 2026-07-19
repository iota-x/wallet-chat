"use client";

import React, { useEffect, useRef } from "react";
import { GlassArtifact } from "./GlassArtifact";

/**
 * The glass artifact, alive. It is always gently breathing — a slow drift, a
 * faint rotation wobble, a subtle scale pulse — and the pointer only *biases*
 * that motion, eased in with weight so the crystal leans toward the light and
 * relaxes back rather than rigidly aiming at the cursor. One rAF loop composes
 * ambient life + a spring-followed pointer influence; no CSS transition fights
 * it. Reduced-motion → it rests still.
 */
export function InteractiveGlass() {
  const hostRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;

    // pointer target (normalised, small) and its eased follower — the "weight"
    let tX = 0, tY = 0; // where the pointer wants it
    let eX = 0, eY = 0; // where it actually is (springs toward target)
    let raf = 0;
    let running = true;
    const start = performance.now();

    function onMove(e: PointerEvent) {
      const host = hostRef.current;
      if (!host) return;
      const r = host.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // gentle, clamped affinity — the cursor nudges, it does not command
      tX = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth * 0.7)));
      tY = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight * 0.7)));
    }
    function onLeave() {
      tX = 0;
      tY = 0;
    }

    function frame(now: number) {
      if (!running) return;
      const t = (now - start) / 1000;
      // spring the follower toward the target (weighted lag)
      eX += (tX - eX) * 0.045;
      eY += (tY - eY) * 0.045;

      // ambient breathing — always present, but nearly imperceptible: slow,
      // small, out-of-phase waves plus a 100%→102%→100% ~11s scale breath.
      const rotWobbleX = Math.sin(t * 0.24) * 0.9 + Math.sin(t * 0.13) * 0.5;
      const rotWobbleY = Math.cos(t * 0.2) * 1.0 + Math.cos(t * 0.15) * 0.5;
      const driftX = Math.cos(t * 0.17) * 3;
      const driftY = Math.sin(t * 0.22) * 3.5;
      const breath = 1 + (Math.sin(t * 0.57) * 0.5 + 0.5) * 0.02;

      const rx = -eY * 6 + rotWobbleX;
      const ry = eX * 7 + rotWobbleY;
      const tx = eX * 6 + driftX;
      const ty = eY * 6 + driftY;
      const scale = breath + Math.hypot(eX, eY) * 0.01;

      const el = tiltRef.current;
      if (el) {
        el.style.transform = `perspective(1100px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(
          2
        )}deg) translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
      }
      raf = requestAnimationFrame(frame);
    }

    // Pause the loop when the hero scrolls out of view.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !running) {
          running = true;
          raf = requestAnimationFrame(frame);
        } else if (!entry.isIntersecting) {
          running = false;
          if (raf) cancelAnimationFrame(raf);
        }
      },
      { threshold: 0 }
    );
    if (hostRef.current) io.observe(hostRef.current);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={hostRef}>
      <div ref={tiltRef} className="will-change-transform">
        <GlassArtifact />
      </div>
    </div>
  );
}
