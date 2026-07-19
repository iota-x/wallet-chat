import React from "react";

/**
 * The hero glass artifact — a faceted, crystalline glass bloom. Built from
 * sharp kite-shaped blades radiating in overlapping rings (sculptural facets,
 * not a soft gradient orb), with crisp iridescent edges and a bright refractive
 * core. Self-contained SVG; no external assets. The subject: a transaction
 * refracted into glass — every facet legible.
 */

const CX = 320;
const CY = 322;

/** A sharp-cornered kite blade from r0→r1 along `ang`, half-width `w`. */
function blade(ang: number, r0: number, r1: number, w: number): string {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const px = -dy;
  const py = dx;
  const mid = (r0 + r1) / 2;
  const p = (r: number) => `${(CX + dx * r).toFixed(1)} ${(CY + dy * r).toFixed(1)}`;
  const s = (sign: number) =>
    `${(CX + dx * mid + px * w * sign).toFixed(1)} ${(CY + dy * mid + py * w * sign).toFixed(1)}`;
  return `M ${p(r0)} L ${s(1)} L ${p(r1)} L ${s(-1)} Z`;
}

function ring(count: number, r0: number, r1: number, w: number, offset = 0) {
  return Array.from({ length: count }).map((_, i) => {
    const ang = ((i + offset) / count) * Math.PI * 2;
    return { d: blade(ang, r0, r1, w), i, ang };
  });
}

export function GlassArtifact({ className = "" }: { className?: string }) {
  const outer = ring(18, 78, 262, 24);
  const mid = ring(22, 40, 168, 15, 0.5);
  const inner = ring(14, 16, 86, 9, 0.25);

  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 640 640" className="w-full h-auto animate-hue-drift" aria-hidden>
        <defs>
          <linearGradient id="iris" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#CDBEF4" />
            <stop offset="30%" stopColor="#8E97E8" />
            <stop offset="58%" stopColor="#EBB2E4" />
            <stop offset="100%" stopColor="#E6A15C" />
          </linearGradient>
          <linearGradient id="iris2" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E6A15C" />
            <stop offset="50%" stopColor="#C9BEEA" />
            <stop offset="100%" stopColor="#8E97E8" />
          </linearGradient>
          <radialGradient id="core" cx="50%" cy="48%" r="52%">
            <stop offset="0%" stopColor="#FFE7C4" stopOpacity="0.95" />
            <stop offset="40%" stopColor="#F4C089" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#B9A6EC" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sheen" cx="38%" cy="30%" r="55%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          {/* Gentle warp keeps the facets crisp but organic. */}
          <filter id="warp" x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="2" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="12" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>

        {/* refractive core glow */}
        <ellipse cx={CX} cy={CY} rx="150" ry="132" fill="url(#core)" />

        {/* the crystalline bloom — widened & tilted for a sculptural stance */}
        <g
          filter="url(#warp)"
          transform={`translate(${CX} ${CY}) scale(1.24 0.9) rotate(-13) translate(${-CX} ${-CY})`}
        >
          {/* outer facets */}
          {outer.map(({ d, i }) => (
            <path
              key={`o${i}`}
              d={d}
              fill="url(#iris)"
              fillOpacity={i % 2 ? 0.24 : 0.34}
              stroke="url(#iris)"
              strokeOpacity={0.7}
              strokeWidth={1}
              strokeLinejoin="round"
            />
          ))}
          {/* mid facets */}
          {mid.map(({ d, i }) => (
            <path
              key={`m${i}`}
              d={d}
              fill="url(#iris2)"
              fillOpacity={i % 2 ? 0.3 : 0.42}
              stroke="#ffffff"
              strokeOpacity={0.28}
              strokeWidth={0.9}
              strokeLinejoin="round"
            />
          ))}
          {/* bright inner heart */}
          {inner.map(({ d, i }) => (
            <path
              key={`i${i}`}
              d={d}
              fill="url(#iris)"
              fillOpacity={0.5}
              stroke="#ffffff"
              strokeOpacity={0.5}
              strokeWidth={0.8}
              strokeLinejoin="round"
            />
          ))}
          {/* specular glints on a few leading edges */}
          {outer
            .filter((_, i) => i % 5 === 0)
            .map(({ ang, i }) => {
              const dx = Math.cos(ang);
              const dy = Math.sin(ang);
              return (
                <line
                  key={`g${i}`}
                  x1={CX + dx * 90}
                  y1={CY + dy * 90}
                  x2={CX + dx * 250}
                  y2={CY + dy * 250}
                  stroke="#ffffff"
                  strokeOpacity="0.55"
                  strokeWidth="0.7"
                />
              );
            })}
        </g>

        <ellipse cx="298" cy="288" rx="205" ry="168" fill="url(#sheen)" />
      </svg>
    </div>
  );
}
