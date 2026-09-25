// Parcours du mode accompagne, en barre horizontale -- 2026-09-25.
//
// Remplace la colonne verticale de 210px. Trois raisons, dans l'ordre :
//
//   1. **elle coupait les libelles** : « Comprehension de l'... », « Signature
//      et dossier ... ». Un parcours dont on ne peut pas lire les etapes ne
//      remplit pas son office ;
//   2. **elle volait 210px de large** a l'etape en cours, qui est le contenu
//      utile de l'ecran ;
//   3. **elle ne montrait pas la progression**. Une pile de sept lignes ne dit
//      pas ou l'on en est ; un trait qui se remplit d'une etape a l'autre, si.
//
// La forme suit la reference : pastilles reliees par un trait, libelle dessous,
// etape courante marquee. Les couleurs, elles, sont celles du produit -- le
// bleu de marque pour l'etape en cours, le vert pour ce qui est acquis, le
// rouge pour ce qui a echoue.
//
// Sur petit ecran la barre defile horizontalement plutot que de se comprimer :
// sept etapes sur 360px donneraient des pastilles sans libelle lisible.

import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Minus } from 'lucide-react';
import type { AoStep, AoStepKey, AoStepStatut } from '../types';

/** Ce que chaque statut vaut visuellement. `acquis` decide du remplissage du
 *  trait qui precede l'etape : il se remplit jusqu'ou le dossier est arrive. */
const STATUT: Record<AoStepStatut, { teinte: string; fond: string; acquis: boolean }> = {
  a_faire:            { teinte: 'var(--adj-ink-4)', fond: 'var(--adj-panel)',     acquis: false },
  en_cours:           { teinte: 'var(--adj-brand)', fond: 'var(--adj-brand-tint)', acquis: false },
  attente_validation: { teinte: 'var(--adj-hold)',  fond: 'var(--adj-hold-tint)',  acquis: false },
  validee:            { teinte: 'var(--adj-pos)',   fond: 'var(--adj-pos-tint)',   acquis: true },
  non_applicable:     { teinte: 'var(--adj-ink-4)', fond: 'var(--adj-panel-2)',    acquis: true },
  erreur:             { teinte: 'var(--adj-neg)',   fond: 'var(--adj-neg-tint)',   acquis: false },
};

function Pastille({ step, actif }: { step: AoStep; actif: boolean }) {
  const s = STATUT[step.statut];
  const taille = 32;

  return (
    <span style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: taille, height: taille, borderRadius: '50%', flexShrink: 0,
      background: s.fond,
      // L'etape courante porte un anneau plus epais : c'est le seul marqueur
      // qui tient quand plusieurs etapes partagent la meme couleur.
      border: `${actif ? 2.5 : 1.5}px solid ${s.teinte}`,
      color: s.teinte,
      fontSize: 'var(--adj-t-xs)', fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      transition: 'border-width .14s',
    }}>
      {step.statut === 'validee' ? <Check size={16} strokeWidth={3} />
        : step.statut === 'erreur' ? <AlertTriangle size={15} strokeWidth={2.4} />
        : step.statut === 'non_applicable' ? <Minus size={15} strokeWidth={2.6} />
        : step.step_order}
    </span>
  );
}

export function StepBar({
  steps, activeKey, onSelect,
}: {
  steps: AoStep[];
  activeKey: AoStepKey | null;
  onSelect: (key: AoStepKey) => void;
}) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t('pipeline.steps.title', { defaultValue: 'Parcours' })}
      className="adj-scroll"
      style={{
        display: 'flex', alignItems: 'flex-start',
        padding: 'var(--adj-5) var(--adj-4) var(--adj-4)',
        background: 'var(--adj-panel)',
        border: '1px solid var(--adj-hairline)',
        borderRadius: 'var(--adj-round-l)',
        overflowX: 'auto',
      }}
    >
      {steps.map((step, i) => {
        const actif = step.step_key === activeKey;
        const s = STATUT[step.statut];
        // Le trait qui precede une etape est rempli si l'etape d'avant est
        // acquise : c'est le chemin parcouru, pas un decor.
        const precedentAcquis = i > 0 && STATUT[steps[i - 1].statut].acquis;

        return (
          <span
            key={step.step_key}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              flex: '1 1 0', minWidth: 104, position: 'relative',
            }}
          >
            {/* Les deux moities de trait sont posees au niveau de la pastille,
                pas entre les colonnes : c'est ce qui les fait se rejoindre
                exactement au centre, quelle que soit la largeur de colonne. */}
            {i > 0 && (
              <span aria-hidden style={{
                position: 'absolute', top: 15, right: '50%', width: '100%', height: 2,
                background: precedentAcquis ? 'var(--adj-pos)' : 'var(--adj-hairline)',
              }} />
            )}

            <button
              type="button"
              onClick={() => onSelect(step.step_key)}
              aria-current={actif ? 'step' : undefined}
              className="adj-focusable adj-anim"
              style={{
                position: 'relative', zIndex: 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                width: '100%', padding: '0 var(--adj-2)',
                border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Pastille step={step} actif={actif} />

              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
                {/* Le libelle passe a la ligne au lieu d'etre tronque : une
                    etape dont on ne lit pas le nom ne sert a rien. */}
                <span style={{
                  fontSize: 'var(--adj-t-xs)',
                  fontWeight: (actif ? 'var(--adj-w-semi)' : 'var(--adj-w-normal)') as never,
                  color: actif ? 'var(--adj-ink)' : 'var(--adj-ink-3)',
                  textAlign: 'center', lineHeight: 1.3,
                }}>
                  {t(`pipeline.steps.${step.step_key}.title`, { defaultValue: step.step_key })}
                </span>
                <span style={{ fontSize: 'var(--adj-t-xs)', color: s.teinte, textAlign: 'center', lineHeight: 1.3 }}>
                  {t(`pipeline.steps.statut.${step.statut}`, { defaultValue: step.statut })}
                </span>
              </span>
            </button>
          </span>
        );
      })}
    </nav>
  );
}
