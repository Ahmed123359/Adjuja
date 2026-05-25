import React from "react";
import { useTheme } from "../hooks/useTheme";
import LandingNav from "../components/landing/LandingNav";
import HeroSection from "../components/landing/HeroSection";
import FeaturesSection from "../components/landing/FeaturesSection";
import HowItWorksSection from "../components/landing/HowItWorksSection";
import LandingFooter from "../components/landing/LandingFooter";

export default function LandingPage({
  onEnterApp,
  onGoRegister,
}: {
  onEnterApp: () => void;
  onGoRegister: () => void;
}) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const bg = dark ? "#05090F" : "#FFFFFF";

  return (
    <div style={{ background: bg, minHeight: "100vh", fontFamily: "DM Sans, system-ui, sans-serif", overflowX: "hidden" }}>
      <LandingNav onEnterApp={onEnterApp} onGoRegister={onGoRegister} />
      <HeroSection onEnterApp={onEnterApp} onGoRegister={onGoRegister} />
      <FeaturesSection />
      <HowItWorksSection />
      <section id="pricing" style={{ minHeight: 40 }} />
      <LandingFooter onEnterApp={onEnterApp} />
    </div>
  );
}
