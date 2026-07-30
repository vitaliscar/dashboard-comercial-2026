"use client";

import React, { useRef, useEffect, useState, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment } from "@react-three/drei";
import * as THREE from "three";

function GLBMesh({ onReady }: { onReady?: () => void }) {
  const { scene } = useGLTF("/logo_3D.glb");
  const groupRef = useRef<THREE.Group>(null);
  const readyFiredRef = useRef(false);

  // Center and fit the model
  const cloned = React.useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c);
    const center = new THREE.Vector3();
    box.getCenter(center);
    c.position.sub(center);
    return c;
  }, [scene]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.55;
    }
    if (!readyFiredRef.current && onReady) {
      readyFiredRef.current = true;
      onReady();
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={cloned} />
    </group>
  );
}

// Preload so it starts fetching immediately
useGLTF.preload("/logo_3D.glb");

interface Logo3DGlbProps {
  /** Canvas size in px (square) */
  size?: number;
  /** Called when first frame is rendered */
  onReady?: () => void;
  className?: string;
}

export default function Logo3DGlb({ size = 260, onReady, className }: Logo3DGlbProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        style={{ width: size, height: size }}
        className={className}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={className}
      aria-label="Logo CCV 3D"
      role="img"
    >
      <Canvas
        camera={{ position: [0, 0, 3.8], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent", width: "100%", height: "100%" }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[-4, 5, 6]} intensity={3.5} castShadow={false} />
        <directionalLight position={[3, -2, -4]} intensity={0.9} />
        <pointLight position={[0, 3, 3]} intensity={1.5} color="#f0a21d" />
        <Suspense fallback={null}>
          <GLBMesh onReady={onReady} />
          <Environment preset="city" />
        </Suspense>
      </Canvas>
    </div>
  );
}
