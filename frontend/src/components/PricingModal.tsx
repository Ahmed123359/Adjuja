import { useState } from 'react';

const PLANS = [
  {
    name: 'Starter',
    price: '79€',
    period: '/ mois HT',
    tagline: 'Pour tester et convaincre en interne',
    highlighted: false,
    features: [
      '50 AOs générés / mois',
      '3 providers LLM (GPT-4o, Claude, Mistral)',
      'Export Word (.docx)',
      'Signatures instantanées illimitées',
      '1 utilisateur',
      'Support e-mail (48h)',
    ],
    cta: "S'abonner — 79€/mois",
    note: 'Sans engagement · résiliable à tout moment',
    action: () => window.open('https://buy.stripe.com/eVq28qcic8UD3Eb8wDdQQ00', '_blank'),
  },
  {
    name: 'Pro',
    price: '249€',
    period: '/ mois HT',
    tagline: 'Pour les équipes commerciales actives',
    highlighted: true,
    features: [
      'Génération illimitée',
      "Digestion jusqu'à 50 documents†",
      'Chat avec vos documents ✨',
      'Signatures instantanées illimitées',
      '5 utilisateurs',
      'Support prioritaire (4h)',
    ],
    cta: "Contacter l'équipe",
    note: 'Le plus choisi par nos clients PME / ETI',
    action: () => (window as any).Calendly?.initPopupWidget({ url: 'https://calendly.com/charif-eljazouli' }),
  },
  {
    name: 'Entreprise',
    price: 'Sur devis',
    period: '',
    tagline: 'Pour les grands groupes et cabinets',
    highlighted: false,
    features: [
      'Génération illimitée',
      "Digestion jusqu'à 200 documents†",
      'Chat avec vos documents ✨',
      'Signatures instantanées illimitées',
      'Utilisateurs illimités',
      'SSO / Active Directory',
      'SLA 99,9 % garanti',
    ],
    cta: "Contacter l'équipe",
    note: 'Déploiement en 5 jours ouvrés',
    action: () => (window as any).Calendly?.initPopupWidget({ url: 'https://calendly.com/charif-eljazouli' }),
  },
];

function IconCheck() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

type Props = { onClose: () => void };

export default function PricingModal({ onClose }: Props) {
  const [closing, setClosing] = useState(false);

  function handleClose() {
    setClosing(true);
    setTimeout(onClose, 200);
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`}
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[.08]"
        style={{ background: '#0a101c' }}>

        {/* Header */}
        <div className="sticky top-0 z-10 px-6 pt-6 pb-4 border-b border-white/[.06]"
          style={{ background: '#0a101c' }}>
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-indigo-400 mb-1">
            Passez à la vitesse supérieure
          </p>
          <h2 className="text-center font-bold text-white text-xl">
            Vous avez utilisé votre génération gratuite
          </h2>
          <p className="text-center text-slate-500 text-sm mt-1">
            Choisissez un plan pour continuer à générer des réponses AO.
          </p>
        </div>

        {/* Cards */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map(({ name, price, period, tagline, highlighted, features, cta, note, action }) => (
            <div
              key={name}
              className="relative rounded-xl p-5 flex flex-col border transition-all"
              style={highlighted
                ? { background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.4)', boxShadow: '0 0 30px rgba(99,102,241,0.15)' }
                : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }
              }
            >
              {highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-full"
                  style={{ background: 'linear-gradient(135deg,#4338ca,#6366f1)', color: '#fff' }}>
                  Recommandé
                </span>
              )}

              <div className="mb-3">
                <p className="font-bold text-white text-sm">{name}</p>
                <p className="text-slate-500 text-xs">{tagline}</p>
              </div>

              <div className="mb-4">
                <span className="font-bold text-2xl text-white">{price}</span>
                {period && <span className="text-slate-500 text-xs ml-1">{period}</span>}
              </div>

              <ul className="space-y-1.5 mb-4 flex-1">
                {features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="text-indigo-400"><IconCheck /></span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={action}
                className="w-full py-2 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={highlighted
                  ? { background: 'linear-gradient(135deg,#4338ca,#6366f1)', color: '#fff', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }
                  : { background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }
                }
              >
                {cta}
              </button>
              <p className="text-[10px] text-slate-600 text-center mt-2">{note}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-slate-700 text-xs pb-4">
          † 1 document = fichier PDF jusqu'à 20 pages A4
        </p>
      </div>
    </div>
  );
}