import { useRef, useEffect } from 'react';
import { useScrollAnimation } from '../hooks/useScrollAnimation';

type OnEnterApp = () => void;

// ── Inline SVG icons ───────────────────────────────────────
function IconDoc() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}
function IconLightning() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}
function IconDatabase() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12" />
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}
function IconCpu() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M3 10h2M3 14h2M19 10h2M19 14h2M10 3v2M14 3v2M10 19v2M14 19v2" />
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}
function IconCode() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ── Data ───────────────────────────────────────────────────
const FEATURES = [
  {
    icon: <IconDoc />,
    title: 'Parsing automatique des AOs',
    desc: "Collez le texte ou importez un PDF. OffrIA extrait le titre, le budget, le type de marché et chaque critère du cahier des charges. Zéro copier-coller.",
  },
  {
    icon: <IconLightning />,
    title: '9 sections rédigées en parallèle',
    desc: "Notre moteur envoie jusqu'à 9 appels LLM simultanément. Une réponse complète et structurée en moins de 2 minutes, là où un humain passerait 16 à 38 heures.",
  },
  {
    icon: <IconDatabase />,
    title: 'Base de connaissances RAG',
    desc: "Vos références, certifications et méthodologies internes enrichissent chaque section via Qdrant. L'IA parle en votre nom, avec vos propres données.",
  },
  {
    icon: <IconCpu />,
    title: 'Multi-LLM au choix',
    desc: "Claude Opus pour le raisonnement complexe, GPT-4o pour la formulation commerciale, Mistral Large pour la souveraineté des données. Le meilleur modèle pour chaque AO.",
  },
  {
    icon: <IconCode />,
    title: 'API REST intégrable',
    desc: "Un endpoint POST /api/v1/generate. Compatible ERP, CRM, SharePoint ou Zapier. Intégrez OffrIA dans vos workflows existants sans changer vos outils.",
  },
  {
    icon: <IconShield />,
    title: 'Hébergement souverain',
    desc: "Déployez en 5 minutes avec Docker, on-premise ou sur votre cloud privé. Vos données restent chez vous. Option Mistral pour un traitement 100 % intra-EU.",
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Chargez votre AO',
    desc: "Collez le texte brut ou importez un PDF. OffrIA lit le document en entier et identifie automatiquement les critères de sélection et les exigences clés.",
    note: 'PDF natif · texte brut',
  },
  {
    n: '02',
    title: "L'IA analyse et rédige",
    desc: "Le moteur enrichit le contexte avec votre base documentaire, puis rédige les 8 sections de réponse en parallèle avec le LLM de votre choix.",
    note: '~90 secondes en moyenne',
  },
  {
    n: '03',
    title: 'Relisez, ajustez, exportez',
    desc: "Votre réponse structurée s'affiche section par section, éditable directement dans le navigateur. Exportez en .docx prêt à soumettre d'un seul clic.",
    note: 'Export Word · éditable en ligne',
  },
];

const PLANS = [
  {
    name: 'Starter',
    price: '290',
    period: '/ mois HT',
    tagline: 'Pour tester et convaincre en interne',
    highlighted: false,
    badge: null as string | null,
    features: ['50 AOs générés / mois', '3 providers LLM (GPT-4o, Claude, Mistral)', 'Parsing automatique', 'Export Word (.docx)', '1 utilisateur', 'Support e-mail (48h)'],
    cta: "Démarrer l'essai gratuit",
    note: '14 jours gratuits, sans carte bancaire',
  },
  {
    name: 'Pro',
    price: '790',
    period: '/ mois HT',
    tagline: 'Pour les équipes commerciales actives',
    highlighted: true,
    badge: 'Recommandé' as string | null,
    features: ['Génération illimitée', 'Base de connaissances RAG', '5 utilisateurs', 'API REST (ERP / CRM)', 'Historique complet des générations', 'Support prioritaire (4h)'],
    cta: 'Commencer avec Pro',
    note: 'Le plus choisi par nos clients PME / ETI',
  },
  {
    name: 'Entreprise',
    price: 'Sur devis',
    period: '',
    tagline: 'Pour les grands groupes et cabinets',
    highlighted: false,
    badge: null as string | null,
    features: ['On-premise ou cloud dédié', 'Utilisateurs illimités', 'SSO / Active Directory', 'Fine-tuning sur vos AOs remportés', 'SLA 99,9 % garanti', 'Accompagnement dédié'],
    cta: "Contacter l'équipe",
    note: 'Déploiement en 5 jours ouvrés',
  },
];

// ── Shared sub-elements ────────────────────────────────────
function SectionLabel({ text }: { text: string }) {
  return (
    <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-400 mb-3">
      {text}
    </p>
  );
}

// ── Main component ─────────────────────────────────────────
export default function LandingPage({ onEnterApp }: { onEnterApp: OnEnterApp }) {
  // Landing is always dark
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const featuresRef  = useRef<HTMLElement>(null);
  const howRef       = useRef<HTMLElement>(null);
  const pricingRef   = useRef<HTMLElement>(null);
  useScrollAnimation(featuresRef);
  useScrollAnimation(howRef);
  useScrollAnimation(pricingRef);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  const btnGradient: React.CSSProperties = {
    background: 'linear-gradient(135deg,#4338ca,#6366f1)',
    boxShadow: '0 4px 24px rgba(99,102,241,0.4)',
  };

  return (
    <div className="min-h-screen text-white overflow-x-hidden" style={{ background: '#050914' }}>

      {/* ── Fixed orb layer ───────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="noise-overlay" />
      </div>

      {/* ── Nav ──────────────────────────────────────────── */}
      <nav
        className="fixed top-0 inset-x-0 z-50 h-14 border-b border-white/[.05]"
        style={{ background: 'rgba(5,9,20,0.75)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
      >
        <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#4338ca,#6366f1)' }}>
              <span className="font-display font-bold text-sm text-white">O</span>
            </div>
            <span className="font-display text-[1.15rem] font-bold tracking-tight">
              <span className="text-white">Offr</span>
              <span className="text-gradient">IA</span>
            </span>
          </div>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-7">
            {[
              ['features', 'Fonctionnalités'],
              ['how-it-works', 'Comment ça marche'],
              ['pricing', 'Tarifs'],
            ].map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)}
                className="text-sm text-slate-400 hover:text-white transition-colors">
                {label}
              </button>
            ))}
          </div>

          {/* CTA */}
          <button onClick={onEnterApp}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.03] active:scale-[0.97]"
            style={btnGradient}>
            Accéder à l'app →
          </button>
        </div>
      </nav>

      <main className="relative z-10">

        {/* ── HERO ─────────────────────────────────────────── */}
        <section className="pt-40 pb-28 px-6 text-center">

          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border mb-8"
            style={{
              borderColor: 'rgba(99,102,241,0.3)',
              background: 'rgba(99,102,241,0.08)',
              animation: 'fade-in 0.7s ease forwards',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-indigo-300 text-xs font-semibold tracking-wide">
              Propulsé par Claude · GPT-4o · Mistral
            </span>
          </div>

          {/* Headline */}
          <h1
            className="font-display font-bold leading-[1.06] tracking-tight mb-6 mx-auto"
            style={{
              fontSize: 'clamp(2.6rem, 7vw, 5rem)',
              maxWidth: '860px',
              animation: 'fade-in-up 0.7s ease 0.1s both',
            }}
          >
            Remportez plus de marchés.
            <br />
            <span className="text-gradient">En 2 minutes chrono.</span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed"
            style={{ fontSize: '1.1rem', animation: 'fade-in-up 0.7s ease 0.2s both' }}
          >
            OffrIA analyse votre appel d'offres, rédige 8 sections en parallèle et vous livre
            une réponse professionnelle — pendant que vous prenez un café.
          </p>

          {/* CTA group */}
          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
            style={{ animation: 'fade-in-up 0.7s ease 0.3s both' }}
          >
            <button onClick={onEnterApp}
              className="px-7 py-3.5 rounded-xl text-white font-semibold transition-all hover:scale-[1.03] active:scale-[0.97]"
              style={{ ...btnGradient, fontSize: '1rem', boxShadow: '0 4px 32px rgba(99,102,241,0.45)' }}>
              Essayer gratuitement →
            </button>
            <button onClick={() => scrollTo('how-it-works')}
              className="text-slate-500 hover:text-white text-sm transition-colors">
              Comment ça marche ↓
            </button>
          </div>

          {/* Stats */}
          <div
            className="flex flex-wrap justify-center gap-12 mb-20"
            style={{ animation: 'fade-in-up 0.7s ease 0.4s both' }}
          >
            {[
              { v: '< 2 min',  l: 'par réponse AO' },
              { v: '10×',      l: "plus d'AOs traités" },
              { v: '3 LLMs',   l: 'Claude · GPT-4o · Mistral' },
              { v: '100 Md€',  l: 'de marchés publics / an en France' },
            ].map(({ v, l }) => (
              <div key={v} className="text-center">
                <p className="font-display font-bold text-3xl text-white mb-1">{v}</p>
                <p className="text-xs text-slate-600">{l}</p>
              </div>
            ))}
          </div>

          {/* App mockup */}
          <div
            className="max-w-5xl mx-auto rounded-2xl overflow-hidden border border-white/[.07]"
            style={{
              boxShadow: '0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(99,102,241,0.12)',
              animation: 'fade-in-up 0.8s ease 0.5s both',
            }}
          >
            {/* Chrome bar */}
            <div className="px-4 py-2.5 flex items-center gap-2 border-b border-white/[.06]"
              style={{ background: '#0a1526' }}>
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(239,68,68,.5)' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(234,179,8,.5)' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(34,197,94,.5)' }} />
              </div>
              <div className="flex-1 h-4 rounded mx-8" style={{ background: '#0f1929' }} />
            </div>
            {/* Mockup body */}
            <div
              className="h-72 md:h-[400px] flex items-center justify-center"
              style={{ background: 'linear-gradient(160deg, #0b1525 0%, #0f1d32 100%)' }}
            >
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#4338ca,#6366f1)' }}>
                  <span className="font-display font-bold text-xl text-white">O</span>
                </div>
                <p className="text-slate-600 text-sm mb-4">Aperçu de l'interface OffrIA</p>
                <button onClick={onEnterApp}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors underline underline-offset-2">
                  Ouvrir l'application →
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURES ─────────────────────────────────────── */}
        <section id="features" ref={featuresRef} className="py-28 px-6">
          <div className="max-w-6xl mx-auto">
            <SectionLabel text="Fonctionnalités" />
            <h2 className="font-display font-bold text-center mb-4 animate-on-scroll"
              style={{ fontSize: 'clamp(1.8rem, 4vw, 2.75rem)' }}>
              Tout ce dont vous avez besoin
              <br /><span className="text-gradient">pour répondre vite et bien</span>
            </h2>
            <p className="text-slate-500 text-center max-w-xl mx-auto mb-16 animate-on-scroll" data-stagger="1">
              Une IA entraînée sur le langage des marchés publics, pas un chatbot généraliste.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map(({ icon, title, desc }, i) => (
                <div
                  key={i}
                  className="animate-on-scroll rounded-2xl p-6 border border-white/[.06] transition-all duration-200 hover:border-indigo-border"
                  data-stagger={i + 2}
                  style={{ background: 'rgba(11,18,32,0.7)', backdropFilter: 'blur(8px)' }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center mb-4 text-indigo-400"
                    style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}
                  >
                    {icon}
                  </div>
                  <h3 className="font-display font-semibold text-white mb-2 text-[0.95rem]">{title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────── */}
        <section id="how-it-works" ref={howRef} className="py-28 px-6"
          style={{ background: 'rgba(8,14,26,0.6)' }}>
          <div className="max-w-5xl mx-auto">
            <SectionLabel text="Comment ça marche" />
            <h2 className="font-display font-bold text-center mb-20 animate-on-scroll"
              style={{ fontSize: 'clamp(1.8rem, 4vw, 2.75rem)' }}>
              De l'AO brut à la réponse<br />
              <span className="text-gradient">en 3 étapes</span>
            </h2>

            {/* Steps */}
            <div className="relative flex flex-col md:flex-row gap-10 md:gap-4">
              {/* Connector line (desktop) */}
              <div className="hidden md:block absolute top-8 left-[20%] right-[20%] h-px"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.25) 30%, rgba(99,102,241,0.25) 70%, transparent)' }} />

              {STEPS.map(({ n, title, desc, note }, i) => (
                <div key={i} className="flex-1 flex flex-col items-center text-center px-4 animate-on-scroll"
                  data-stagger={i + 1}>
                  {/* Circle */}
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mb-6 relative z-10 flex-shrink-0"
                    style={{
                      background: i === 1
                        ? 'linear-gradient(135deg,#4338ca,#6366f1)'
                        : 'rgba(99,102,241,0.1)',
                      border: i === 1 ? 'none' : '1px solid rgba(99,102,241,0.3)',
                      boxShadow: i === 1 ? '0 0 36px rgba(99,102,241,0.55)' : 'none',
                    }}
                  >
                    <span
                      className="font-display font-bold text-lg"
                      style={{ color: i === 1 ? '#fff' : '#818cf8' }}
                    >
                      {n}
                    </span>
                  </div>
                  <h3 className="font-display font-semibold text-white mb-2 text-[1rem]">{title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed mb-3">{desc}</p>
                  <span
                    className="text-[11px] px-2.5 py-1 rounded-full text-slate-600"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    {note}
                  </span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="text-center mt-16 animate-on-scroll" data-stagger="4">
              <button onClick={onEnterApp}
                className="px-7 py-3.5 rounded-xl text-white font-semibold transition-all hover:scale-[1.03] active:scale-[0.97]"
                style={btnGradient}>
                Générer ma première réponse →
              </button>
            </div>
          </div>
        </section>

        {/* ── PRICING ──────────────────────────────────────── */}
        <section id="pricing" ref={pricingRef} className="py-28 px-6">
          <div className="max-w-5xl mx-auto">
            <SectionLabel text="Tarifs" />
            <h2 className="font-display font-bold text-center mb-4 animate-on-scroll"
              style={{ fontSize: 'clamp(1.8rem, 4vw, 2.75rem)' }}>
              Choisissez votre plan
            </h2>
            <p className="text-slate-500 text-center mb-16 animate-on-scroll" data-stagger="1">
              Sans engagement · Annulez à tout moment · Facture disponible sous 48h
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              {PLANS.map(({ name, price, period, tagline, highlighted, badge, features, cta, note }, i) => (
                <div
                  key={i}
                  className="animate-on-scroll rounded-2xl p-7 border relative"
                  data-stagger={i + 2}
                  style={{
                    background: highlighted ? 'rgba(12,21,38,0.95)' : 'rgba(8,14,26,0.6)',
                    borderColor: highlighted ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.06)',
                    transform: highlighted ? 'scale(1.05)' : 'none',
                    boxShadow: highlighted
                      ? '0 0 48px rgba(99,102,241,0.2), 0 0 0 1px rgba(99,102,241,0.15)'
                      : 'none',
                    zIndex: highlighted ? 1 : 0,
                  }}
                >
                  {badge && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span
                        className="text-[11px] font-semibold px-3 py-1.5 rounded-full text-white"
                        style={{ background: 'linear-gradient(135deg,#4338ca,#6366f1)' }}
                      >
                        {badge}
                      </span>
                    </div>
                  )}

                  <p className="font-display font-semibold text-white mb-1">{name}</p>
                  <p className="text-slate-500 text-xs mb-5">{tagline}</p>

                  <div className="mb-6">
                    {period ? (
                      <span className="font-display font-bold text-4xl text-white">
                        {price}
                        <span className="text-slate-500 text-sm font-normal ml-1">{period}</span>
                      </span>
                    ) : (
                      <span className="font-display font-bold text-2xl text-white">{price}</span>
                    )}
                  </div>

                  <ul className="space-y-2.5 mb-7">
                    {features.map((f, j) => (
                      <li key={j} className="flex items-center gap-2.5 text-sm text-slate-400">
                        <span className="text-indigo-400"><IconCheck /></span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={onEnterApp}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={highlighted
                      ? { background: 'linear-gradient(135deg,#4338ca,#6366f1)', color: '#fff', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }
                      : { background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }
                    }
                  >
                    {cta}
                  </button>

                  <p className="text-[11px] text-slate-600 text-center mt-3">{note}</p>
                </div>
              ))}
            </div>

            <p className="text-center text-slate-700 text-xs mt-12 animate-on-scroll" data-stagger="5">
              Tous les prix sont HT. TVA applicable selon la législation française.
              Déploiement on-premise disponible sur devis.
            </p>
          </div>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[.05] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-600 text-sm">
          <span className="font-display font-bold text-base">
            <span className="text-white">Offr</span>
            <span className="text-gradient">IA</span>
          </span>
          <p>© 2025 OffrIA — L'IA qui remporte vos marchés.</p>
          <div className="flex gap-6">
            {[
              ['features', 'Fonctionnalités'],
              ['how-it-works', 'Comment ça marche'],
              ['pricing', 'Tarifs'],
            ].map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)}
                className="hover:text-white transition-colors">
                {label}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
