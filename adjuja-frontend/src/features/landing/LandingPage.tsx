import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";
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
  const { hash } = useLocation();

  /* Arrivee par un lien /#section (barre de navigation ou pied de page d'une
     page legale) : le navigateur ne descend pas seul vers une ancre rendue
     apres le chargement. */
  useEffect(() => {
    if (!hash) return;
    const id = window.setTimeout(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
    }, 60);
    return () => window.clearTimeout(id);
  }, [hash]);

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
      <LandingFooter onEnterApp={onEnterApp} onGoRegister={onGoRegister} />
    </div>
  );
}
