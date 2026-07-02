import { Suspense, useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

/* ── Earth, positioned like the old moon hero: huge sphere dipping below
   the viewport, only the upper horizon visible ── */
function EarthOrb() {
  const sphereRef = useRef<THREE.Mesh>(null!);
  const cloudsRef = useRef<THREE.Mesh>(null!);
  const glowRef   = useRef<THREE.Mesh>(null!);
  const moonRef   = useRef<THREE.Mesh>(null!);
  const [colorTex, reliefTex, cloudsTex] = useTexture(["/earth.jpg", "/moon.jpg", "/earth-clouds.jpg"]);
  const { camera, size } = useThree();

  const isMobile = size.width < 640;
  const isTablet = size.width < 1024;

  const globeY      = isMobile ? -13 : isTablet ? -12 : -13;
  const globeX      = 0;
  const globeRadius = isMobile ? 11  : isTablet ? 11  : 12;
  const moonRadius  = isMobile ? 0.5 : 0.55;

  /* Floating moon  anchored to the camera's own local space (right, up, forward),
     so it always lands in the visible sky no matter the globe's scale or fov per breakpoint. */
  const moonLocalOffset = new THREE.Vector3(
    isMobile ? 1.6 : isTablet ? 2.2 : 2.4,
    isMobile ? 2.2 : isTablet ? 1.3 : 1.1,
    isMobile ? -8  : isTablet ? -5.5 : -5,
  );

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (isMobile) {
      cam.fov = 58; camera.position.set(0, 0, 8);
    } else if (isTablet) {
      cam.fov = 55; camera.position.set(0, 1, 11);
    } else {
      cam.fov = 50; camera.position.set(0, 1.2, 13);
    }
    cam.updateProjectionMatrix();
  }, [camera, isMobile, isTablet]);

  const moonWorldPos = new THREE.Vector3();

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    sphereRef.current.rotation.y = t * 0.06;
    cloudsRef.current.rotation.y = t * 0.085;
    glowRef.current.rotation.y   = t * 0.06;

    moonWorldPos.copy(moonLocalOffset).applyMatrix4(camera.matrixWorld);
    moonWorldPos.y += Math.sin(t * 0.5) * 0.25;
    moonRef.current.position.copy(moonWorldPos);
    moonRef.current.rotation.y += delta * 0.3;
  });

  return (
    <>
      {/* Lights stay at world-space  NOT nested under the globe's translation,
          otherwise their default (0,0,0) target shifts the lit face away from camera */}
      <ambientLight intensity={0.18} />
      <directionalLight position={[-8, 6, 5]} intensity={1.1} color="#fff3e0" />
      <directionalLight position={[6, -2, 4]}  intensity={0.25} color="#1BC9A8" />

      {/* Globe */}
      <mesh ref={sphereRef} position={[globeX, globeY, 0]}>
        <sphereGeometry args={[globeRadius, 96, 96]} />
        <meshStandardMaterial
          map={colorTex}
          bumpMap={reliefTex}
          bumpScale={0.25}
          roughness={0.85}
          metalness={0.0}
        />
      </mesh>

      {/* Cloud layer  real NASA-based cloud cover, slightly faster spin for parallax */}
      <mesh ref={cloudsRef} position={[globeX, globeY, 0]} scale={1.008}>
        <sphereGeometry args={[globeRadius, 96, 96]} />
        <meshStandardMaterial
          alphaMap={cloudsTex}
          color="#ffffff"
          transparent
          opacity={0.55}
          depthWrite={false}
          roughness={1}
        />
      </mesh>

      {/* Atmosphere glow  the rim-light that sells the 3D depth */}
      <mesh ref={glowRef} position={[globeX, globeY, 0]} scale={1.025}>
        <sphereGeometry args={[globeRadius, 64, 64]} />
        <meshBasicMaterial color="#2B79E8" transparent opacity={0.3} side={THREE.BackSide} />
      </mesh>

      {/* Floating moon  anchored to camera space, always in the visible sky, gentle bob */}
      <mesh ref={moonRef}>
        <sphereGeometry args={[moonRadius, 48, 48]} />
        <meshStandardMaterial map={reliefTex} bumpMap={reliefTex} bumpScale={0.08} roughness={0.9} color="#dfe6f5" />
      </mesh>
    </>
  );
}

export default function HeroSection({
  onEnterApp,
}: {
  onEnterApp: () => void;
  onGoRegister: () => void;
}) {
  return (
    <section className="relative flex h-[100svh] min-h-[640px] w-full flex-col justify-center pb-[19vh] overflow-hidden bg-[#0A0F1E]">

      {/* Corner color bleed  brand cobalt top-left, teal bottom-right */}
      <div className="pointer-events-none absolute -left-32 -top-32 z-[1] h-[420px] w-[420px] rounded-full bg-[#3248CE] opacity-35 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 z-[1] h-[420px] w-[420px] rounded-full bg-[#1BC9A8] opacity-30 blur-[120px]" />

      {/* Three.js canvas  full-bleed, the earth is positioned in 3D space, not boxed in a div */}
      <div className="absolute inset-0 z-[1]">
        <Canvas
          camera={{ position: [0, 1.5, 10], fov: 60, near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: true }}
          style={{ width: "100%", height: "100%" }}
        >
          <Suspense fallback={null}>
            <EarthOrb />
          </Suspense>
        </Canvas>
      </div>

      <div className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(ellipse_120%_100%_at_50%_0%,rgba(255,255,255,0.04),transparent_60%)]" />

      {/* Bottom fade  dissolves the globe into the next section's bg instead of a hard cut */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[420px] bg-[linear-gradient(180deg,transparent_0%,rgba(9,13,28,0.18)_35%,rgba(9,13,28,0.55)_65%,rgba(9,13,28,0.88)_85%,#090D1C_100%)]" />

      <div className="relative z-[3] mx-auto flex w-full max-w-[1280px] flex-col items-center px-8 text-center md:px-14">

        <h1 className="m-0 max-w-[820px] text-[clamp(2.1rem,4.4vw,3.5rem)] font-extrabold leading-[1.2] tracking-[-.025em] text-white">
          Remportez plus de marchés,
          <br />
          <span className="bg-[linear-gradient(90deg,#3248CE_0%,#2B79E8_50%,#1BC9A8_100%)] bg-clip-text text-transparent">
            sans y passer vos nuits.
          </span>
        </h1>

        <p
          className="m-0 mt-6 max-w-[440px] text-[15px] leading-[1.7] text-[rgba(238,244,255,0.92)]"
          style={{ textShadow: "0 2px 18px rgba(5,8,20,0.9), 0 1px 4px rgba(5,8,20,0.95)" }}
        >
          Du DAO au dossier signé, automatiquement. Analysez, redigez, exportez en minutes.
        </p>

        <button
          onClick={onEnterApp}
          className="mt-8 inline-flex cursor-pointer items-center gap-[10px] rounded-full border-0 bg-[linear-gradient(135deg,#3248CE_0%,#2B79E8_100%)] px-8 py-[14px] text-[13px] font-bold tracking-[.04em] text-white shadow-[0_12px_32px_rgba(43,121,232,0.35)] transition-all hover:-translate-y-px hover:shadow-[0_16px_40px_rgba(43,121,232,0.45)] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#1BC9A8]/70"
        >
          Déposer mon premier DAO
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>

      </div>
    </section>
  );
}
