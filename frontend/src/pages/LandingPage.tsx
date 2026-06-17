import { lazy, Suspense, useEffect } from "react";
import LandingNav from "../components/landing/LandingNav";
import HowItWorksSection from "../components/landing/HowItWorksSection";
import PricingSection from "../components/landing/PricingSection";
import LandingFooter from "../components/landing/LandingFooter";

/* Three.js chargé en lazy pour ne pas bloquer le LCP */
const HeroSection = lazy(() => import("../components/landing/HeroSection"));

function HeroFallback() {
  return <div style={{ height: "100svh", minHeight: 640, background: "#050818" }} />;
}

export default function LandingPage({
  onEnterApp,
  onGoRegister,
}: {
  onEnterApp: () => void;
  onGoRegister: () => void;
}) {
  useEffect(() => {
    const els = document.querySelectorAll(".animate-on-scroll");
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } }),
      { threshold: 0.08 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing-dark">
      <LandingNav onEnterApp={onEnterApp} onGoRegister={onGoRegister} />
      <Suspense fallback={<HeroFallback />}>
        <HeroSection onEnterApp={onEnterApp} onGoRegister={onGoRegister} />
      </Suspense>
      <HowItWorksSection />
      <PricingSection onEnterApp={onEnterApp} />
      <LandingFooter onEnterApp={onEnterApp} />
    </div>
  );
}
