import { lazy, Suspense } from "react";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import LandingNav from "./components/LandingNav";
import FeaturesSection from "./components/FeaturesSection";
import HowItWorksSection from "./components/HowItWorksSection";
import TrustSection from "./components/TrustSection";
import PricingSection from "./components/PricingSection";
import FaqSection from "./components/FaqSection";
import LandingFooter from "./components/LandingFooter";

/* Three.js chargé en lazy pour ne pas bloquer le LCP */
const HeroSection = lazy(() => import("./components/HeroSection"));

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
