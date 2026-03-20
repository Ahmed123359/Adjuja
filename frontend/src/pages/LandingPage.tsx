import React, { useRef, useEffect, useState } from 'react';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import {
  Zap, Database, Shield,
  Clock, FileCheck, TrendingUp, Check,
  Sparkles, LayoutGrid, PlayCircle, CreditCard,
} from 'lucide-react';
import { MenuBar } from '../components/GlowMenu';

// ── Palette tokens ──────────────────────────────────────────
const NAVY   = '#1e3a8a';
const ROYAL  = '#3b82f6';
const DARK   = '#0f172a';
const BODY   = '#475569';
const MUTED  = '#64748b';
const SURF   = '#f8fafc';
const BRD    = '#e2e8f0';

// ── Data ───────────────────────────────────────────────────
const CARDS = [
  {
    icon: Clock,
    title: '2 minutes au lieu de 2 jours',
    desc: "Une réponse complète, structurée et prête à soumettre en moins de 2 minutes. Traitez 10× plus d'AOs sans recruter.",
  },
  {
    icon: Database,
    title: "L'IA apprend de vos documents",
    desc: "Importez vos anciennes réponses gagnantes, références clients et certifications. OffrIA les réutilise automatiquement — comme un expert qui connaît tout votre historique.",
  },
  {
    icon: FileCheck,
    title: 'Aucune exigence oubliée',
    desc: "Chaque critère du cahier des charges est analysé et traité. Pièces attendues, format de réponse, critères de sélection — rien ne passe à travers les mailles.",
  },
  {
    icon: TrendingUp,
    title: 'Remportez plus de marchés',
    desc: "Des réponses mieux structurées, plus conformes et rédigées dans le langage attendu par les acheteurs publics. Un avantage concret sur vos concurrents.",
  },
  {
    icon: Shield,
    title: 'Vos données restent chez vous',
    desc: "Hébergement européen, conformité RGPD, option on-premise. Vos documents confidentiels ne quittent jamais votre périmètre.",
  },
  {
    icon: Zap,
    title: 'Claude, GPT-4o ou Mistral',
    desc: "Choisissez le meilleur modèle selon l'AO : puissance de raisonnement, formulation commerciale ou souveraineté des données. Vous gardez le contrôle.",
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Importez votre AO',
    desc: "Glissez votre DCE (PDF ou texte brut). OffrIA extrait automatiquement les critères, les lots et les pièces demandées.",
    note: 'PDF natif · texte brut',
  },
  {
    n: '02',
    title: "Réponse générée en parallèle",
    desc: "Chaque section — mémoire technique, références, planning — est rédigée simultanément et adaptée à votre profil entreprise.",
    note: '~90 secondes en moyenne',
  },
  {
    n: '03',
    title: 'Relisez, ajustez, soumettez',
    desc: "Exportez en Word ou PDF, apportez vos touches finales et déposez sur la plateforme de votre choix.",
    note: 'Export Word · éditable en ligne',
  },
];

const PLANS = [
  {
    name: 'Starter',
    price: '55€',
    priceOld: '79€',
    period: '/ mois HT',
    tagline: 'Pour les solopreneurs qui veulent gagner plus d\'AOs',
    highlighted: false,
    badge: 'Early Bird −30 %' as string | null,
    features: [
      { text: '50 AOs générés / mois', tag: null },
      { text: '3 providers LLM (GPT-4o, Claude, Mistral)', tag: null },
      { text: 'Export Word (.docx)', tag: null },
      { text: 'Signatures instantanées illimitées', tag: null },
      { text: '1 utilisateur', tag: null },
      { text: 'Support e-mail (48h)', tag: null },
    ],
    cta: "S'abonner — 55€/mois",
    note: 'Sans engagement · résiliable à tout moment',
  },
  {
    name: 'Pro',
    price: '249€',
    priceOld: null as string | null,
    period: '/ mois HT',
    tagline: 'Pour les équipes commerciales actives',
    highlighted: true,
    badge: 'Recommandé' as string | null,
    features: [
      { text: 'Génération illimitée', tag: null },
      { text: "Digestion jusqu'à 50 documents†", tag: null },
      { text: 'Chat avec vos documents', tag: 'Nouveau' },
      { text: 'Signatures instantanées illimitées', tag: null },
      { text: '5 utilisateurs', tag: null },
      { text: 'Historique complet des générations', tag: null },
      { text: 'Support prioritaire (4h)', tag: null },
    ],
    cta: "Contacter l'équipe",
    note: 'Le plus choisi par nos clients PME / ETI',
  },
  {
    name: 'Entreprise',
    price: 'Sur devis',
    priceOld: null as string | null,
    period: '',
    tagline: 'Pour les grands groupes et cabinets',
    highlighted: false,
    badge: null as string | null,
    features: [
      { text: 'Génération illimitée', tag: null },
      { text: "Digestion jusqu'à 200 documents†", tag: null },
      { text: 'Chat avec vos documents', tag: 'Nouveau' },
      { text: 'Signatures instantanées illimitées', tag: null },
      { text: 'Utilisateurs illimités', tag: null },
      { text: 'SSO / Active Directory', tag: null },
      { text: 'SLA 99,9 % garanti', tag: null },
      { text: 'Accompagnement dédié', tag: null },
    ],
    cta: "Contacter l'équipe",
    note: 'Déploiement en 5 jours ouvrés',
  },
];

const NAV_ITEMS = [
  { icon: LayoutGrid, label: 'Fonctionnalités',    gradient: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0) 70%)',  iconColor: 'text-blue-500',    id: 'features'     },
  { icon: PlayCircle, label: 'Comment ça marche',  gradient: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0) 70%)',   iconColor: 'text-indigo-500',  id: 'how-it-works' },
  { icon: CreditCard, label: 'Tarifs',             gradient: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0) 70%)',   iconColor: 'text-emerald-500', id: 'pricing'      },
];

// ── Main component ─────────────────────────────────────────
export default function LandingPage({ onEnterApp, onGoRegister }: { onEnterApp: () => void; onGoRegister: () => void }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState('');

  // Always light mode on landing
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  const benefitsRef = useRef<HTMLElement>(null);
  const howRef      = useRef<HTMLElement>(null);
  const pricingRef  = useRef<HTMLElement>(null);
  useScrollAnimation(benefitsRef);
  useScrollAnimation(howRef);
  useScrollAnimation(pricingRef);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen bg-white text-foreground overflow-x-hidden font-sans">

      {/* ── Early bird banner ────────────────────────────── */}
      <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center h-9 px-4 text-sm font-semibold overflow-hidden cursor-pointer hover:brightness-95 transition-all"
        style={{ background: '#fbbf24', color: '#1c1917' }}
        onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}>
        {/* Mobile */}
        <span className="sm:hidden">🐦 Early Bird — <strong>−30 %</strong> sur tous les plans</span>
        {/* Desktop */}
        <span className="hidden sm:inline">
          🐦 Offre Early Bird — <strong>−30 % sur tous les plans</strong> pour les 50 premiers abonnés
          <span style={{ color: '#78350f' }}> · Profitez-en avant la fin du lancement</span>
        </span>
      </div>

      {/* ── Nav ──────────────────────────────────────────── */}
      <header
        className="fixed inset-x-0 z-40 h-16 border-b"
        style={{ top: '36px', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(18px)', borderColor: BRD }}
      >
        <nav className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5 cursor-pointer"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: NAVY }}>
              <span className="font-display font-bold text-sm text-white">O</span>
            </div>
            <span className="font-display font-bold text-lg" style={{ color: DARK }}>OffrIA</span>
          </div>

          {/* Nav links — desktop */}
          <div className="hidden md:flex">
            <MenuBar
              items={NAV_ITEMS}
              activeItem={activeNav}
              onItemClick={(label) => {
                const item = NAV_ITEMS.find(i => i.label === label);
                if (item) { setActiveNav(label); scrollTo(item.id); }
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <button onClick={onEnterApp}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]"
              style={{ background: NAVY }}>
              Accéder →
            </button>
            {/* Hamburger — mobile */}
            <button className="md:hidden p-2 transition-colors" style={{ color: MUTED }}
              onClick={() => setMobileMenuOpen(o => !o)}>
              {mobileMenuOpen
                ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
              }
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t py-3 flex flex-col gap-1 bg-white" style={{ borderColor: BRD }}>
            {[
              ['features',     'Fonctionnalités'],
              ['how-it-works', 'Comment ça marche'],
              ['pricing',      'Tarifs'],
            ].map(([id, label]) => (
              <button key={id}
                onClick={() => { scrollTo(id); setMobileMenuOpen(false); }}
                className="text-sm text-left px-6 py-2 transition-colors"
                style={{ color: BODY }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main>

        {/* ══ 1 — HERO ══════════════════════════════════════════ */}
        <section className="pt-40 sm:pt-44 pb-20 sm:pb-24 px-6 text-center">
          <div className="max-w-4xl mx-auto">

            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 mb-8"
              style={{ animation: 'fade-in-up 0.6s ease both' }}
            >
              <Sparkles className="w-4 h-4" style={{ color: MUTED }} />
              <span className="text-sm font-sans" style={{ color: MUTED }}>
                Propulsé par des agents IA autonomes
              </span>
            </div>

            {/* H1 */}
            <h1
              className="font-display font-extrabold leading-[1.08] tracking-tight mb-6"
              style={{
                fontSize: 'clamp(2.2rem, 5.5vw, 4rem)',
                color: DARK,
                animation: 'fade-in-up 0.6s ease 0.1s both',
              }}
            >
              Remportez plus de marchés.
              <br />
              <span style={{ color: ROYAL }}>
                Sans y passer vos{' '}
                <span className="relative inline-block">
                  nuits
                  {/* Tache de marqueur rouge — forme irrégulière, style main */}
                  <svg
                    aria-hidden="true"
                    className="absolute overflow-visible pointer-events-none"
                    viewBox="0 0 100 22"
                    preserveAspectRatio="none"
                    style={{ top: '65%', transform: 'translateY(-50%)', height: '0.55em', left: '-3%', width: '106%' }}
                  >
                    <path
                      d="M0,6 C8,3 30,2 55,4 C75,5 90,3 102,5 L103,16 C88,19 60,18 40,17 C20,16 8,18 -1,15 Z"
                      fill="#ef4444"
                      opacity="0.78"
                    />
                  </svg>
                </span>
                .
              </span>
            </h1>

            {/* Subtitle */}
            <p
              className="font-serif text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
              style={{ color: BODY, animation: 'fade-in-up 0.6s ease 0.2s both' }}
            >
              OffrIA analyse votre appel d'offres, rédige chaque section
              et vous livre une réponse professionnelle — pendant que vous
              vous concentrez sur votre cœur de métier.
            </p>

            {/* CTA */}
            <div style={{ animation: 'fade-in-up 0.6s ease 0.3s both' }}>
              <button onClick={onEnterApp}
                className="w-full sm:w-auto px-8 py-4 rounded-xl text-white font-semibold text-base transition-all hover:opacity-90 active:scale-[0.97]"
                style={{ background: ROYAL, boxShadow: `0 4px 20px ${ROYAL}55` }}>
                Essayer gratuitement →
              </button>
            </div>

            {/* Stats */}
            <div
              className="flex flex-wrap justify-center gap-10 sm:gap-16 mt-16"
              style={{ animation: 'fade-in-up 0.6s ease 0.45s both' }}
            >
              {[
                { v: '< 2 min',  l: 'par réponse AO' },
                { v: '10×',      l: "plus d'AOs traités" },
                { v: '3 LLMs',   l: 'Claude · GPT-4o · Mistral' },
                { v: '100 Md€',  l: 'marchés publics / an' },
              ].map(({ v, l }) => (
                <div key={v} className="text-center">
                  <p className="font-display font-extrabold text-2xl sm:text-3xl mb-0.5" style={{ color: DARK }}>{v}</p>
                  <p className="text-xs" style={{ color: MUTED }}>{l}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ 2 — FONCTIONNALITÉS ═══════════════════════════════ */}
        <section id="features" ref={benefitsRef}
          className="py-24 px-6"
          style={{ background: SURF }}>
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: ROYAL }}>
                Fonctionnalités
              </p>
              <h2 className="font-display font-bold text-3xl sm:text-4xl mb-4 animate-on-scroll" style={{ color: DARK }}>
                Pourquoi les équipes choisissent OffrIA
              </h2>
              <p className="font-serif text-lg max-w-xl mx-auto animate-on-scroll" data-stagger="1" style={{ color: BODY }}>
                Concentrez-vous sur la stratégie. Nous nous occupons de la rédaction.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {CARDS.map(({ icon: Icon, title, desc }, i) => (
                <div key={i}
                  className="bg-white rounded-xl p-7 animate-on-scroll"
                  data-stagger={i + 2}
                  style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(30,58,138,0.06)', border: `1px solid ${BRD}` }}>
                  <div className="w-11 h-11 rounded-lg flex items-center justify-center mb-4"
                    style={{ background: `${ROYAL}15` }}>
                    <Icon className="w-5 h-5" style={{ color: ROYAL }} />
                  </div>
                  <h3 className="font-display font-bold text-base mb-2" style={{ color: DARK }}>{title}</h3>
                  <p className="font-serif text-sm leading-relaxed" style={{ color: BODY }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ 3 — COMMENT ÇA MARCHE ════════════════════════════ */}
        <section id="how-it-works" ref={howRef} className="py-24 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: ROYAL }}>
                Processus
              </p>
              <h2 className="font-display font-bold text-3xl sm:text-4xl mb-3 animate-on-scroll" style={{ color: DARK }}>
                Comment ça marche
              </h2>
              <p className="font-serif text-lg animate-on-scroll" data-stagger="1" style={{ color: BODY }}>
                Trois étapes. Zéro complexité.
              </p>
            </div>

            <div className="space-y-12">
              {STEPS.map(({ n, title, desc, note }, i) => (
                <div key={i} className="flex gap-5 sm:gap-8 items-start animate-on-scroll" data-stagger={i + 2}>
                  <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center"
                    style={{ background: NAVY }}>
                    <span className="font-display font-bold text-white text-base sm:text-lg">{n}</span>
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-xl mb-2" style={{ color: DARK }}>{title}</h3>
                    <p className="font-serif leading-relaxed mb-3 max-w-xl" style={{ color: BODY }}>{desc}</p>
                    <span className="text-xs px-2.5 py-1 rounded-full font-sans" style={{ background: `${ROYAL}14`, color: ROYAL, border: `1px solid ${ROYAL}30` }}>
                      {note}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center mt-14 animate-on-scroll" data-stagger="5">
              <button onClick={onEnterApp}
                className="w-full sm:w-auto px-8 py-4 rounded-xl text-white font-semibold text-base transition-all hover:opacity-90 active:scale-[0.97]"
                style={{ background: ROYAL }}>
                Générer ma première réponse →
              </button>
            </div>
          </div>
        </section>

        {/* ══ 4 — TARIFS ════════════════════════════════════════ */}
        <section id="pricing" ref={pricingRef} className="py-24 px-6" style={{ background: SURF }}>
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: ROYAL }}>
                Tarifs
              </p>
              <h2 className="font-display font-bold text-3xl sm:text-4xl mb-2 animate-on-scroll" style={{ color: DARK }}>
                Choisissez votre plan
              </h2>
              <p className="font-serif animate-on-scroll" data-stagger="1" style={{ color: BODY }}>
                Sans engagement · Annulez à tout moment · Facture sous 48h
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
              {PLANS.map(({ name, price, priceOld, period, tagline, highlighted, badge, features, cta, note }, i) => (
                <div key={i}
                  className="bg-white rounded-2xl p-6 relative animate-on-scroll"
                  data-stagger={i + 2}
                  style={{
                    border: highlighted ? `2px solid ${NAVY}` : `1px solid ${BRD}`,
                    boxShadow: highlighted ? `0 8px 40px ${NAVY}20, 0 0 0 1px ${NAVY}15` : '0 1px 3px rgba(0,0,0,0.04)',
                    transform: highlighted ? 'scale(1.02)' : 'none',
                    zIndex: highlighted ? 1 : 0,
                  }}>
                  {badge && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="text-[11px] font-semibold px-3 py-1 rounded-full text-white"
                        style={{ background: NAVY }}>{badge}</span>
                    </div>
                  )}
                  <div className="mb-4">
                    <p className="font-display font-bold text-base mb-0.5" style={{ color: DARK }}>{name}</p>
                    <p className="text-xs" style={{ color: MUTED }}>{tagline}</p>
                  </div>
                  <div className="mb-5">
                    {priceOld && (
                      <span className="text-sm line-through mr-2" style={{ color: MUTED }}>{priceOld}</span>
                    )}
                    {period
                      ? <span className="font-display font-extrabold text-3xl" style={{ color: priceOld ? '#dc2626' : DARK }}>
                          {price}<span className="text-sm font-normal ml-1" style={{ color: MUTED }}>{period}</span>
                        </span>
                      : <span className="font-display font-bold text-xl" style={{ color: DARK }}>{price}</span>
                    }
                  </div>
                  <ul className="space-y-2 mb-6">
                    {features.map((f, j) => (
                      <li key={j} className="flex items-center gap-2 text-sm" style={{ color: BODY }}>
                        <Check className="w-4 h-4 flex-shrink-0" style={{ color: ROYAL }} />
                        <span>{f.text}</span>
                        {f.tag && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: `${ROYAL}20`, color: ROYAL, border: `1px solid ${ROYAL}40` }}>
                            {f.tag}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => {
                      if (name === 'Starter') {
                        window.open('https://buy.stripe.com/5kQaEWcic8UD2A7aELdQQ01', '_blank');
                      } else {
                        (window as any).Calendly?.initPopupWidget({ url: 'https://calendly.com/charif-eljazouli' });
                      }
                    }}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                    style={highlighted
                      ? { background: NAVY, color: '#fff' }
                      : { background: 'transparent', color: NAVY, border: `1.5px solid ${NAVY}` }
                    }>
                    {cta}
                  </button>
                  <p className="text-[10px] text-center mt-2" style={{ color: MUTED }}>{note}</p>
                </div>
              ))}
            </div>

            <p className="text-center text-xs mt-4 animate-on-scroll" data-stagger="5" style={{ color: MUTED }}>
              † 1 document = fichier PDF jusqu'à 20 pages A4
            </p>
            <p className="text-center text-xs mt-1 animate-on-scroll" data-stagger="5" style={{ color: MUTED }}>
              Tous les prix sont HT · TVA applicable · Déploiement on-premise sur devis
            </p>
            <p className="text-center text-sm mt-5 animate-on-scroll" data-stagger="5" style={{ color: MUTED }}>
              Pas encore convaincu ?{' '}
              <button onClick={onGoRegister} className="font-semibold underline underline-offset-2 transition-colors"
                style={{ color: ROYAL }}>
                Essayez gratuitement — 1 AO sans CB →
              </button>
            </p>
          </div>
        </section>

        {/* ══ 5 — CTA BAND ═════════════════════════════════════ */}
        <section className="py-24 px-6" style={{ background: NAVY }}>
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-white mb-4">
              Prêt à transformer votre taux de réussite ?
            </h2>
            <p className="font-serif text-lg mb-10 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Rejoignez les équipes commerciales qui gagnent du temps et remportent plus de marchés avec OffrIA.
            </p>
            <button onClick={onEnterApp}
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base transition-all hover:opacity-90 active:scale-[0.97]"
              style={{ background: '#ffffff', color: NAVY }}>
              Commencer gratuitement →
            </button>
          </div>
        </section>

      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="py-12 px-6 border-t" style={{ borderColor: BRD }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: NAVY }}>
              <span className="font-display font-bold text-xs text-white">O</span>
            </div>
            <span className="font-display font-semibold" style={{ color: DARK }}>OffrIA</span>
          </div>
          <div className="flex items-center gap-8 text-sm" style={{ color: MUTED }}>
            {[
              ['features',     'Fonctionnalités'],
              ['how-it-works', 'Comment ça marche'],
              ['pricing',      'Tarifs'],
            ].map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)}
                className="transition-colors hover:text-gray-900">
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm font-serif" style={{ color: MUTED }}>
            © 2025 OffrIA. Tous droits réservés.
          </p>
        </div>
      </footer>
    </div>
  );
}
