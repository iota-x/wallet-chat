import React from "react";

/**
 * The hero glass artifact — an iridescent, layered glass form built from warped
 * concentric contours (structure, so it reads as a prismatic sculpture, not a
 * generic gradient blob). Self-contained SVG; no external assets. The subject:
 * a transaction refracted into glass — every layer legible.
 */
export function GlassArtifact({ className = "" }: { className?: string }) {
  const rings = Array.from({ length: 34 });
  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 640 640"
        className="w-full h-auto animate-hue-drift"
        aria-hidden
      >
        <defs>
          <linearGradient id="iris" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#C7B8F0" />
            <stop offset="34%" stopColor="#8E97E8" />
            <stop offset="62%" stopColor="#EBB2E4" />
            <stop offset="100%" stopColor="#E6A15C" />
          </linearGradient>
          <radialGradient id="core" cx="50%" cy="46%" r="55%">
            <stop offset="0%" stopColor="#F4C089" stopOpacity="0.9" />
            <stop offset="45%" stopColor="#B9A6EC" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#8E97E8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sheen" cx="40%" cy="30%" r="60%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <filter id="warp" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.006 0.017"
              numOctaves="2"
              seed="11"
              result="n"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="n"
              scale="26"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          <filter id="soft">
            <feGaussianBlur stdDeviation="0.7" />
          </filter>
        </defs>

        {/* volumetric core */}
        <ellipse cx="320" cy="312" rx="250" ry="210" fill="url(#core)" filter="url(#warp)" />

        {/* layered glass contours */}
        <g
          filter="url(#warp)"
          transform="rotate(-16 320 320)"
          stroke="url(#iris)"
          fill="none"
        >
          {rings.map((_, i) => {
            const t = i / rings.length;
            const rx = 46 + t * 250;
            const ry = 30 + t * 150;
            return (
              <ellipse
                key={i}
                cx={320}
                cy={318}
                rx={rx}
                ry={ry}
                strokeWidth={1 + (1 - t) * 1.5}
                strokeOpacity={0.34 + (1 - t) * 0.5}
                filter="url(#soft)"
              />
            );
          })}
        </g>

        {/* prismatic edge spikes — the feathered fins */}
        <g
          filter="url(#warp)"
          transform="rotate(-16 320 320)"
          stroke="url(#iris)"
          strokeOpacity="0.5"
        >
          {Array.from({ length: 30 }).map((_, i) => {
            const a = (i / 30) * Math.PI * 2;
            const r0 = 200;
            const r1 = 250 + (i % 3) * 16;
            return (
              <line
                key={i}
                x1={320 + Math.cos(a) * r0 * 1.4}
                y1={318 + Math.sin(a) * r0}
                x2={320 + Math.cos(a) * r1 * 1.4}
                y2={318 + Math.sin(a) * r1}
                strokeWidth={0.9}
              />
            );
          })}
        </g>

        <ellipse cx="300" cy="286" rx="220" ry="180" fill="url(#sheen)" />
      </svg>
    </div>
  );
}
