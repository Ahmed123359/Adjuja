import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import catLottieUrl from '../assets/Loading Cat.lottie?url';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import {
  Zap, Database, Shield,
  Clock, FileCheck, TrendingUp, Check,
  LayoutGrid, PlayCircle, CreditCard,
} from 'lucide-react';
import { MenuBar } from '../components/GlowMenu';
import LanguageSelector from '../components/LanguageSelector';

// ── Palette tokens ──────────────────────────────────────────
const NAVY   = '#1e3a8a';
const ROYAL  = '#3b82f6';
const DARK   = '#0f172a';
const BODY   = '#475569';
const MUTED  = '#64748b';
const SURF   = '#f8fafc';
const BRD    = '#e2e8f0';

const CARD_ICONS = [Clock, Database, FileCheck, TrendingUp, Shield, Zap] as const;
const CARD_KEYS  = ['speed', 'memory', 'complete', 'winrate', 'privacy', 'models'] as const;
const STEP_NUMS  = ['01', '02', '03'] as const;
const STEP_KEYS  = ['s1', 's2', 's3'] as const;

// ── Main component ─────────────────────────────────────────
export default function LandingPage({ onEnterApp, onGoRegister }: { onEnterApp: () => void; onGoRegister: () => void }) {
  const { t, i18n } = useTranslation();
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

  const NAV_ITEMS = [
    { icon: LayoutGrid, label: t('nav.features'),    gradient: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0) 70%)',  iconColor: 'text-blue-500',    id: 'features'     },
    { icon: PlayCircle, label: t('nav.howItWorks'),  gradient: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0) 70%)',   iconColor: 'text-indigo-500',  id: 'how-it-works' },
    { icon: CreditCard, label: t('nav.pricing'),     gradient: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0) 70%)',   iconColor: 'text-emerald-500', id: 'pricing'      },
  ];

  const PLANS = [
    {
      nameKey: 'starter',
      price: '55€',
      priceOld: '79€',
      period: i18n.language === 'fr' ? '/ mois HT' : '/ month excl. VAT',
      highlighted: false,
      features: [
        { key: 'f_50_ao', tag: null },
        { key: 'f_providers', tag: null },
        { key: 'f_export', tag: null },
        { key: 'f_signatures', tag: null },
        { key: 'f_users_1', tag: null },
        { key: 'f_support_email', tag: null },
      ],
      stripeUrl: 'https://buy.stripe.com/5kQaEWcic8UD2A7aELdQQ01',
    },
    {
      nameKey: 'pro',
      price: '174€',
      priceOld: '249€' as string | null,
      period: i18n.language === 'fr' ? '/ mois HT' : '/ month excl. VAT',
      highlighted: true,
      features: [
        { key: 'f_unlimited_gen', tag: null },
        { key: 'f_docs_50', tag: null },
        { key: 'f_chat', tag: t('pricing.plans.tag_new') },
        { key: 'f_signatures', tag: null },
        { key: 'f_users_5', tag: null },
        { key: 'f_history', tag: null },
        { key: 'f_support_priority', tag: null },
      ],
      stripeUrl: null,
    },
    {
      nameKey: 'enterprise',
      price: t('pricing.plans.enterprise_price'),
      priceOld: null as string | null,
      period: '',
      highlighted: false,
      features: [
        { key: 'f_unlimited_gen', tag: null },
        { key: 'f_docs_200', tag: null },
        { key: 'f_chat', tag: t('pricing.plans.tag_new') },
        { key: 'f_signatures', tag: null },
        { key: 'f_users_unlimited', tag: null },
        { key: 'f_sso', tag: null },
        { key: 'f_sla', tag: null },
        { key: 'f_onboarding', tag: null },
      ],
      stripeUrl: null,
    },
  ];

  return (
    <div className="min-h-screen bg-white text-foreground overflow-x-hidden font-sans">

      {/* ── Early bird banner ────────────────────────────── */}
      <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center h-9 px-4 text-sm font-semibold overflow-hidden cursor-pointer hover:brightness-95 transition-all"
        style={{ background: '#fbbf24', color: '#1c1917' }}
        onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}>
        <span className="sm:hidden">🐦 Early Bird — <strong>−30 %</strong> {i18n.language === 'fr' ? 'sur tous les plans' : 'on all plans'}</span>
        <span className="hidden sm:inline">
          🐦 {i18n.language === 'fr'
            ? <>Offre Early Bird — <strong>−30 % sur tous les plans</strong> pour les 50 premiers abonnés<span style={{ color: '#78350f' }}> · Profitez-en avant la fin du lancement</span></>
            : <>Early Bird offer — <strong>−30 % on all plans</strong> for the first 50 subscribers<span style={{ color: '#78350f' }}> · Take advantage before the launch ends</span></>
          }
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
            <LanguageSelector />

            <button onClick={onEnterApp}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]"
              style={{ background: NAVY }}>
              {t('nav.access')}
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
            {NAV_ITEMS.map(({ id, label }) => (
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
        <section className="pt-40 sm:pt-44 pb-20 sm:pb-24 px-6">
          <div className="max-w-6xl mx-auto flex flex-col items-center">

            {/* Deux colonnes : H1 + subtitle | Cat */}
            <div className="w-full flex flex-col lg:flex-row items-center gap-12 mb-10">

              {/* Colonne texte */}
              <div className="flex-1 text-center lg:text-left"
                style={{ animation: 'fade-in-up 0.6s ease 0.1s both' }}>
                <h1
                  className="font-display font-extrabold leading-[1.08] tracking-tight mb-6"
                  style={{ fontSize: 'clamp(2.2rem, 5.5vw, 4rem)', color: DARK }}
                >
                  {t('hero.title1')}
                  <br />
                  <span style={{ color: ROYAL }}>
                    {t('hero.title2')}{' '}
                    <span style={{
                      display: 'inline-block',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='268' height='172' viewBox='0 0 268 172' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4.65617 81.6702C-2.63807 84.3564 0.045652 102.025 6.0508 109.879C6.18987 110.573 6.35292 111.261 6.51601 111.949C-2.15454 117.053 5.99213 146.525 15.8737 143.292C16.9197 142.963 17.9781 142.679 19.0356 142.298C14.3142 150.684 22.021 174.324 30.7604 171.446C107.481 146.304 184.177 121.168 260.897 96.0259C270.37 92.9024 263.818 67.6366 254.409 64.5974C257.319 63.8175 260.206 63.044 263.129 62.3095C273.415 59.6999 264.821 28.7868 254.407 30.5528C243.174 32.4407 231.991 34.4131 220.833 36.5736C224.21 35.3274 227.587 34.0811 230.988 32.8284C240.877 29.1542 232.227 -2.62179 222.265 1.07173C149.709 27.927 77.1886 54.8214 4.63208 81.6767L4.65617 81.6702Z' fill='%23ef4444' opacity='0.6'/%3E%3C/svg%3E")`,
                      backgroundSize: 'contain',
                      backgroundPosition: 'center center',
                      backgroundRepeat: 'no-repeat',
                      whiteSpace: 'nowrap',
                      padding: '0.2em 0.25em',
                    }}>
                      {t('hero.highlight')}</span>
                  </span>
                </h1>
                <p className="font-serif text-lg sm:text-xl leading-relaxed" style={{ color: BODY }}>
                  {t('hero.subtitle')}
                </p>
              </div>

              {/* Colonne chat */}
              <div className="flex-shrink-0 flex flex-col items-center">
                <DotLottieReact src={catLottieUrl} loop autoplay style={{ width: 280, height: 280 }} />
                <p className="text-xs mt-2" style={{ color: MUTED }}>{t('hero.catCaption')}</p>
              </div>
            </div>

            {/* CTA — centré */}
            <div style={{ animation: 'fade-in-up 0.6s ease 0.3s both' }}>
              <button onClick={onEnterApp}
                className="px-8 py-4 rounded-xl text-white font-semibold text-base transition-all hover:opacity-90 active:scale-[0.97]"
                style={{ background: ROYAL, boxShadow: `0 4px 20px ${ROYAL}55` }}>
                {t('hero.cta')}
              </button>
            </div>

            {/* Stats — centrées */}
            <div className="flex flex-wrap justify-center gap-10 sm:gap-16 mt-14"
              style={{ animation: 'fade-in-up 0.6s ease 0.45s both' }}>
              {([
                { v: t('hero.stats.time'),   l: t('hero.stats.timeLabel') },
                { v: t('hero.stats.scale'),  l: t('hero.stats.scaleLabel') },
                { v: t('hero.stats.llms'),   l: t('hero.stats.llmsLabel') },
                { v: t('hero.stats.market'), l: t('hero.stats.marketLabel') },
              ] as { v: string; l: string }[]).map(({ v, l }) => (
                <div key={v} className="text-center">
                  <p className="font-display font-extrabold text-2xl sm:text-3xl mb-0.5" style={{ color: DARK }}>{v}</p>
                  <p className="text-xs" style={{ color: MUTED }}>{l}</p>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* ══ 2 — FONCTIONNALITÉS ═══════════════════════════════ */}
        <section id="features" ref={benefitsRef} className="py-24 px-6" style={{ background: SURF }}>
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: ROYAL }}>
                {t('features.label')}
              </p>
              <h2 className="font-display font-bold text-3xl sm:text-4xl mb-4 animate-on-scroll" style={{ color: DARK }}>
                {t('features.title')}
              </h2>
              <p className="font-serif text-lg max-w-xl mx-auto animate-on-scroll" data-stagger="1" style={{ color: BODY }}>
                {t('features.subtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {CARD_KEYS.map((key, i) => {
                const Icon = CARD_ICONS[i];
                return (
                  <div key={key}
                    className="bg-white rounded-xl p-7 animate-on-scroll"
                    data-stagger={i + 2}
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(30,58,138,0.06)', border: `1px solid ${BRD}` }}>
                    <div className="w-11 h-11 rounded-lg flex items-center justify-center mb-4" style={{ background: `${ROYAL}15` }}>
                      <Icon className="w-5 h-5" style={{ color: ROYAL }} />
                    </div>
                    <h3 className="font-display font-bold text-base mb-2" style={{ color: DARK }}>{t(`features.cards.${key}_title`)}</h3>
                    <p className="font-serif text-sm leading-relaxed" style={{ color: BODY }}>{t(`features.cards.${key}_desc`)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══ 3 — COMMENT ÇA MARCHE ════════════════════════════ */}
        <section id="how-it-works" ref={howRef} className="py-24 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: ROYAL }}>
                {t('howItWorks.label')}
              </p>
              <h2 className="font-display font-bold text-3xl sm:text-4xl mb-3 animate-on-scroll" style={{ color: DARK }}>
                {t('howItWorks.title')}
              </h2>
              <p className="font-serif text-lg animate-on-scroll" data-stagger="1" style={{ color: BODY }}>
                {t('howItWorks.subtitle')}
              </p>
            </div>

            <div className="space-y-12">
              {STEP_KEYS.map((key, i) => (
                <div key={key} className="flex gap-5 sm:gap-8 items-start animate-on-scroll" data-stagger={i + 2}>
                  <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center" style={{ background: NAVY }}>
                    <span className="font-display font-bold text-white text-base sm:text-lg">{STEP_NUMS[i]}</span>
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-xl mb-2" style={{ color: DARK }}>{t(`howItWorks.steps.${key}_title`)}</h3>
                    <p className="font-serif leading-relaxed mb-3 max-w-xl" style={{ color: BODY }}>{t(`howItWorks.steps.${key}_desc`)}</p>
                    <span className="text-xs px-2.5 py-1 rounded-full font-sans" style={{ background: `${ROYAL}14`, color: ROYAL, border: `1px solid ${ROYAL}30` }}>
                      {t(`howItWorks.steps.${key}_note`)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center mt-14 animate-on-scroll" data-stagger="5">
              <button onClick={onEnterApp}
                className="w-full sm:w-auto px-8 py-4 rounded-xl text-white font-semibold text-base transition-all hover:opacity-90 active:scale-[0.97]"
                style={{ background: ROYAL }}>
                {t('howItWorks.cta')}
              </button>
            </div>
          </div>
        </section>

        {/* ══ 4 — TARIFS ════════════════════════════════════════ */}
        <section id="pricing" ref={pricingRef} className="py-24 px-6" style={{ background: SURF }}>
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: ROYAL }}>
                {t('pricing.label')}
              </p>
              <h2 className="font-display font-bold text-3xl sm:text-4xl mb-2 animate-on-scroll" style={{ color: DARK }}>
                {t('pricing.title')}
              </h2>
              <p className="font-serif animate-on-scroll" data-stagger="1" style={{ color: BODY }}>
                {t('pricing.subtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
              {PLANS.map(({ nameKey, price, priceOld, period, highlighted, features, stripeUrl }, i) => (
                <div key={nameKey}
                  className="bg-white rounded-2xl p-6 relative animate-on-scroll"
                  data-stagger={i + 2}
                  style={{
                    border: highlighted ? `2px solid ${NAVY}` : `1px solid ${BRD}`,
                    boxShadow: highlighted ? `0 8px 40px ${NAVY}20, 0 0 0 1px ${NAVY}15` : '0 1px 3px rgba(0,0,0,0.04)',
                    transform: highlighted ? 'scale(1.02)' : 'none',
                    zIndex: highlighted ? 1 : 0,
                  }}>
                  {t(`pricing.plans.${nameKey}_badge`) && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="text-[11px] font-semibold px-3 py-1 rounded-full text-white"
                        style={{ background: NAVY }}>{t(`pricing.plans.${nameKey}_badge`)}</span>
                    </div>
                  )}
                  <div className="mb-4">
                    <p className="font-display font-bold text-base mb-0.5" style={{ color: DARK }}>{t(`pricing.plans.${nameKey}_name`)}</p>
                    <p className="text-xs" style={{ color: MUTED }}>{t(`pricing.plans.${nameKey}_tagline`)}</p>
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
                    {features.map(({ key, tag }) => (
                      <li key={key} className="flex items-center gap-2 text-sm" style={{ color: BODY }}>
                        <Check className="w-4 h-4 flex-shrink-0" style={{ color: ROYAL }} />
                        <span>{t(`pricing.plans.${key}`)}</span>
                        {tag && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: `${ROYAL}20`, color: ROYAL, border: `1px solid ${ROYAL}40` }}>
                            {tag}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => {
                      if (stripeUrl) {
                        window.open(stripeUrl, '_blank');
                      } else {
                        (window as any).Calendly?.initPopupWidget({ url: 'https://calendly.com/charif-eljazouli' });
                      }
                    }}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                    style={highlighted
                      ? { background: NAVY, color: '#fff' }
                      : { background: 'transparent', color: NAVY, border: `1.5px solid ${NAVY}` }
                    }>
                    {t(`pricing.plans.${nameKey}_cta`)}
                  </button>
                  <p className="text-[10px] text-center mt-2" style={{ color: MUTED }}>{t(`pricing.plans.${nameKey}_note`)}</p>
                </div>
              ))}
            </div>

            <p className="text-center text-xs mt-4 animate-on-scroll" data-stagger="5" style={{ color: MUTED }}>
              {t('pricing.footnote1')}
            </p>
            <p className="text-center text-xs mt-1 animate-on-scroll" data-stagger="5" style={{ color: MUTED }}>
              {t('pricing.footnote2')}
            </p>
            <p className="text-center text-sm mt-5 animate-on-scroll" data-stagger="5" style={{ color: MUTED }}>
              {t('pricing.freeTrial')}
              <button onClick={onGoRegister} className="font-semibold underline underline-offset-2 transition-colors"
                style={{ color: ROYAL }}>
                {t('pricing.freeTrialCta')}
              </button>
            </p>
          </div>
        </section>

        {/* ══ 5 — CTA BAND ═════════════════════════════════════ */}
        <section className="py-24 px-6" style={{ background: NAVY }}>
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-white mb-4">
              {t('ctaBand.title')}
            </h2>
            <p className="font-serif text-lg mb-10 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {t('ctaBand.subtitle')}
            </p>
            <button onClick={onEnterApp}
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base transition-all hover:opacity-90 active:scale-[0.97]"
              style={{ background: '#ffffff', color: NAVY }}>
              {t('ctaBand.cta')}
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
            {NAV_ITEMS.map(({ id, label }) => (
              <button key={id} onClick={() => scrollTo(id)}
                className="transition-colors hover:text-gray-900">
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm font-serif" style={{ color: MUTED }}>
            {t('footer.rights')}
          </p>
        </div>
      </footer>
    </div>
  );
}
