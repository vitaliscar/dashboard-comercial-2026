"use client";

import React, { useEffect, useState, lazy, Suspense } from "react";

const ThreeCanvas = lazy(() => import("./svg-3d-logo-canvas"));

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
          <Suspense fallback={null}>
            <ThreeCanvas size={size} onReady={() => setLogoReady(true)} />
          </Suspense>
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
