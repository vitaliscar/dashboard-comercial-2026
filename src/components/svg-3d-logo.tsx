"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

const LOGO_SVG = `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 20010904//EN"
 "http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd">
<svg version="1.0" xmlns="http://www.w3.org/2000/svg"
 width="1510.000000pt" height="1740.000000pt" viewBox="0 0 1510.000000 1740.000000"
 preserveAspectRatio="xMidYMid meet">

<g transform="translate(0.000000,1740.000000) scale(0.100000,-0.100000)"
fill="#000000" stroke="none">
<path d="M2233 14738 c3 -1853 7 -2718 15 -2843 23 -349 43 -603 68 -835 194
-1824 741 -3408 1621 -4693 167 -243 474 -633 673 -852 147 -162 455 -469 615
-611 1533 -1369 3650 -2197 6185 -2418 415 -37 1402 -79 1445 -62 13 5 15 900
15 7491 l0 7485 -1850 0 -1850 0 -2 -5324 -3 -5324 -127 53 c-785 330 -1425
819 -1910 1462 -661 874 -1053 2061 -1162 3518 -9 110 -18 227 -22 260 -3 33
-8 1251 -11 2708 l-4 2647 -1850 0 -1850 0 4 -2662z"/>
</g>
</svg>
`;

const LOGO_SIZE = 300;

function useLogoGeometry() {
  return useMemo(() => {
    const loader = new SVGLoader();
    const data = loader.parse(LOGO_SVG);
    const shapes: THREE.Shape[] = [];
    data.paths.forEach((path) => {
      shapes.push(...SVGLoader.createShapes(path));
    });

    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: 120,
      bevelEnabled: true,
      bevelThickness: 8,
      bevelSize: 8,
      bevelSegments: 4,
      curveSegments: 24,
    });
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();

    const box = geometry.boundingBox as THREE.Box3;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 3.2 / maxDim;
    geometry.translate(-center.x, -center.y, -center.z);

    return { geometry, scale };
  }, []);
}

function LogoMesh({ onReady }: { onReady: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const readyFiredRef = useRef(false);
  const { geometry, scale } = useLogoGeometry();

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y -= delta * 0.5;
    }
    if (!readyFiredRef.current) {
      readyFiredRef.current = true;
      onReady();
    }
  });

  return (
    <group ref={groupRef} scale={[scale, -scale, scale]}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color="#f0a21d"
          metalness={0.85}
          roughness={0.05}
          clearcoat={1}
          clearcoatRoughness={0.05}
          emissive="#f0a21d"
          emissiveIntensity={0.25}
        />
      </mesh>
    </group>
  );
}

interface SVG3DLogoProps {
  size?: number;
  showLabel?: boolean;
}

const SVG3DLogo: React.FC<SVG3DLogoProps> = ({ size = 300, showLabel = true }) => {
  const [mounted, setMounted] = useState(false);
  const [logoReady, setLogoReady] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div style={{ position: "relative", width: size, height: "auto" }}>
      <style>{`
        @-webkit-keyframes blur-to-sharp {
          0% {
            opacity: 0;
            -webkit-filter: blur(10px);
            filter: blur(10px);
          }
          100% {
            opacity: 1;
            -webkit-filter: blur(0px);
            filter: blur(0px);
          }
        }
        @keyframes blur-to-sharp {
          0% {
            opacity: 0;
            -webkit-filter: blur(10px);
            filter: blur(10px);
          }
          100% {
            opacity: 1;
            -webkit-filter: blur(0px);
            filter: blur(0px);
          }
        }
        .blur-to-sharp {
          -webkit-animation: blur-to-sharp 1s cubic-bezier(0.215, 0.610, 0.355, 1.000) both;
          animation: blur-to-sharp 1s cubic-bezier(0.215, 0.610, 0.355, 1.000) both;
        }
      `}</style>
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
        }}
      >
        {mounted && (
          <Canvas
            camera={{ position: [0, 0, 6], fov: 35 }}
            gl={{ antialias: true, alpha: true }}
            style={{ background: "transparent" }}
          >
            <ambientLight intensity={1.3} />
            <directionalLight position={[-3, 4.5, 6.5]} intensity={3.0} />
            <directionalLight position={[3, -2, -4]} intensity={0.8} />
            <LogoMesh onReady={() => setLogoReady(true)} />
          </Canvas>
        )}
      </div>
      {showLabel && logoReady && (
        <h1
          className="blur-to-sharp"
          style={{
            textAlign: "center",
            fontSize: "clamp(18px, 5.2vw, 26px)",
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: 0.5,
            whiteSpace: "nowrap",
            margin: "16px 0 0 0",
            padding: 0,
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          }}
        >
          Gestión Comercial CCV
        </h1>
      )}
    </div>
  );
};

export default SVG3DLogo;
