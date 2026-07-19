"use client";

import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshTransmissionMaterial, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";

/**
 * The hero glass artifact in real 3D — a crystalline glass gem that refracts an
 * iridescent, palette-coloured environment (lilac · periwinkle · amber · magenta).
 * Low-poly facets read as cut crystal; transmission + iridescence give it real
 * glass. Self-contained: the environment is built from in-scene light shapes, no
 * external HDRI. Client-only (WebGL); the SVG version is the SSR/loading fallback.
 */

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Gem() {
  const ref = useRef<THREE.Group>(null);
  const reduce = prefersReducedMotion();
  // A light backdrop for the transmission to sample, so the crystal reads as
  // bright translucent glass instead of transmitting the empty (black) scene.
  const backdrop = useMemo(() => new THREE.Color("#E2DAF2"), []);

  useFrame((_, dt) => {
    if (ref.current && !reduce) {
      ref.current.rotation.y += dt * 0.26;
      ref.current.rotation.x += dt * 0.08;
    }
  });

  return (
    <group ref={ref} rotation={[0.35, 0.2, 0.12]}>
      <mesh scale={[1.68, 1.54, 1.68]}>
        {/* detail 0 → 20 sharp facets: cut crystal, not a smooth orb */}
        <icosahedronGeometry args={[1, 0]} />
        <MeshTransmissionMaterial
          background={backdrop}
          samples={10}
          resolution={512}
          transmission={1}
          thickness={0.85}
          roughness={0.08}
          ior={1.44}
          chromaticAberration={0.75}
          anisotropy={0.25}
          distortion={0.25}
          distortionScale={0.3}
          temporalDistortion={0.05}
          iridescence={1}
          iridescenceIOR={1.32}
          iridescenceThicknessRange={[140, 520]}
          color="#f6f1ff"
          attenuationColor="#ecdcff"
          attenuationDistance={3}
        />
      </mesh>
    </group>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.7} />
      {/* Bright, palette-tinted environment so the crystal reads as translucent
          glass (refracting light, not black) and picks up iridescent colour. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={1.15} color="#ffffff" position={[0, 0, -6]} scale={[20, 20, 1]} />
        <Lightformer form="rect" intensity={3.2} color="#ffffff" position={[0, 5, -3]} scale={[9, 3, 1]} />
        <Lightformer form="circle" intensity={4.2} color="#B49BF0" position={[-4.5, 2, 3]} scale={4.5} />
        <Lightformer form="circle" intensity={4.4} color="#E89A4E" position={[4.5, -1.5, 3]} scale={3.6} />
        <Lightformer form="ring" intensity={4} color="#EE49BE" position={[3.5, 3.8, -1]} scale={3} />
        <Lightformer form="circle" intensity={3.4} color="#7E8CF0" position={[-3.5, -3, 2]} scale={3.2} />
      </Environment>
      <Gem />
    </>
  );
}

export default function GlassArtifact3D() {
  return (
    <Canvas
      className="w-full h-full"
      camera={{ position: [0, 0, 5.2], fov: 32 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
    >
      <Scene />
    </Canvas>
  );
}
