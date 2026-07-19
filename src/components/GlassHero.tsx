"use client";

import React from "react";
import dynamic from "next/dynamic";
import { GlassArtifact } from "./GlassArtifact";

// WebGL is client-only; show the SVG facet version while it loads / for SSR.
const GlassArtifact3D = dynamic(() => import("./GlassArtifact3D"), {
  ssr: false,
  loading: () => <GlassArtifact />,
});

/** Falls back to the SVG artifact if WebGL is unavailable or the canvas errors. */
class GlassBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <GlassArtifact />;
    return this.props.children;
  }
}

export function GlassHero() {
  return (
    <div className="aspect-square w-full">
      <GlassBoundary>
        <GlassArtifact3D />
      </GlassBoundary>
    </div>
  );
}
