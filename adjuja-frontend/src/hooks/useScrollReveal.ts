import { useEffect } from "react";

/** Active le fondu/translation des elements `.animate-on-scroll` (voir index.css) via
 * IntersectionObserver. Necessaire sur toute page qui reutilise des composants landing
 * (LandingFooter, TrustSection, etc.) -- sans cet observer, ces elements restent a
 * opacity:0 pour toujours puisque la classe .is-visible n'est jamais ajoutee. */
export function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".animate-on-scroll");
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } }),
      { threshold: 0.08 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}
