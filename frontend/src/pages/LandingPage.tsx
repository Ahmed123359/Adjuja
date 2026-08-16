import { lazy, Suspense } from "react";
import { useScrollReveal } from "../hooks/useScrollReveal";
import LandingNav from "../components/landing/LandingNav";
import FeaturesSection from "../components/landing/FeaturesSection";
import HowItWorksSection from "../components/landing/HowItWorksSection";
import TrustSection from "../components/landing/TrustSection";
import PricingSection from "../components/landing/PricingSection";
import FaqSection from "../components/landing/FaqSection";
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
  useScrollReveal();

  return (
    <div className="landing-dark">
      <LandingNav onEnterApp={onEnterApp} onGoRegister={onGoRegister} />
      <Suspense fallback={<HeroFallback />}>
        <HeroSection onEnterApp={onEnterApp} onGoRegister={onGoRegister} />
      </Suspense>
      <FeaturesSection />
      <HowItWorksSection />
      <TrustSection />
      <PricingSection onEnterApp={onEnterApp} />
      <FaqSection />
      <LandingFooter onEnterApp={onEnterApp} />
    </div>
  );
}
