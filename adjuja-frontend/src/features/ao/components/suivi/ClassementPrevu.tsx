// Classement prévu par le décret 2-22-431 (art. 43, 44, 144) -- 2026-10-01.
//
// Le calcul est fait par le serveur (app/services/attribution.py) ; cet écran
// le montre dans l'ordre où l'on se pose les questions : qui gagnerait, où
// suis-je, qui est écarté et pourquoi. Les limites du calcul (anormalement
// basse sous réserve de justification, égalité) sont dites, pas cachées.

import { useTranslation } from 'react-i18next';
import { AlertTriangle, Trophy } from 'lucide-react';
import { useIsMobile } from '../../../../hooks/useIsMobile';
import type { ClassementPrevu as Classement, NatureMarche, OffreCalculee } from '../../types';
import { afficherMontant, afficherNombre } from './montants';

const th: React.CSSProperties = {
  textAlign: 'left', padding: '0 12px 10px', fontSize: 'var(--adj-t-xs)', fontWeight: 600,
  color: 'var(--adj-ink-3)', borderBottom: '1px solid var(--adj-hairline)', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '12px', fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)',
  borderBottom: '1px solid var(--adj-hairline)', verticalAlign: 'top',
};

function montantRetenu(o: OffreCalculee): string | null {
  return o.montant_corrige ?? o.montant_lu;
}

/** Ce que le calcul a fait de l'offre : son rang, ou la raison de son écart. */
function Issue({ o }: { o: OffreCalculee }) {
  const { t } = useTranslation();
  if (o.issue === 'retenue') {
    return <span style={{ color: o.gagnante ? 'var(--adj-pos)' : 'var(--adj-ink-2)', fontWeight: (o.gagnante ? 'var(--adj-w-semi)' : 'var(--adj-w-normal)') as never }}>
      {o.gagnante ? t('suivi.classement.gagnante') : t('suivi.classement.rang', { rang: o.rang })}
    </span>;
  }
  return <span style={{ color: 'var(--adj-neg)' }}>{t(`suivi.issue.${o.issue}`, { defaultValue: o.issue ?? '' })}</span>;
}

function Mesure({ o, nature }: { o: OffreCalculee; nature: NatureMarche }) {
  const { i18n } = useTranslation();
  const loc = i18n.language === 'en' ? 'en-GB' : 'fr-FR';
  if (nature === 'etudes' && o.note_globale !== null) return <>{afficherNombre(o.note_globale, loc)} / 100</>;
  if (nature === 'gardiennage_nettoyage' && o.taux_majoration_pct !== null) {
    return <>{Number(o.taux_majoration_pct) > 0 ? '+' : ''}{afficherNombre(o.taux_majoration_pct, loc)} %</>;
  }
  if (o.ecart_reference_pct !== null) {
    return <>{Number(o.ecart_reference_pct) > 0 ? '+' : ''}{afficherNombre(o.ecart_reference_pct, loc)} %</>;
  }
  return <>-</>;
}

export function ClassementPrevu({ classement, offres, nature }: {
  classement: Classement | null; offres: OffreCalculee[]; nature: NatureMarche;
}) {
  const { t, i18n } = useTranslation();
  const loc = i18n.language === 'en' ? 'en-GB' : 'fr-FR';
  const etroit = useIsMobile(760);
  if (!classement) return null;

  if (!classement.calculable) {
    return (
      <p style={{ margin: 0, color: 'var(--adj-ink-2)', lineHeight: 'var(--adj-lead-body)' as never }}>
        {t(`suivi.raison.${classement.raison}`, { defaultValue: classement.raison ?? '' })}
      </p>
    );
  }

  const gagnante = offres.find(o => o.gagnante) ?? null;
  const nous = offres.find(o => o.est_nous) ?? null;
  // Rangées : classées d'abord (par rang), écartées ensuite.
  const ordre = [...offres].sort((a, b) => (a.rang ?? 999) - (b.rang ?? 999));
  const colonneMesure = nature === 'etudes' ? 'noteGlobale' : nature === 'gardiennage_nettoyage' ? 'taux' : 'ecartReference';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--adj-4)' }}>
      {gagnante && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12, padding: 'var(--adj-4)',
          borderRadius: 'var(--adj-round-m)', background: gagnante.est_nous ? 'var(--adj-pos-tint)' : 'var(--adj-panel-2)',
        }}>
          <Trophy size={20} color={gagnante.est_nous ? 'var(--adj-pos)' : 'var(--adj-ink-3)'} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontWeight: 'var(--adj-w-bold)' as never, color: 'var(--adj-ink)' }}>
              {gagnante.est_nous
                ? t('suivi.classement.vousGagnez')
                : t('suivi.classement.gagnantPrevu', { nom: gagnante.nom, montant: afficherMontant(montantRetenu(gagnante), loc) })}
            </span>
            <span className="adj-fig" style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)' }}>
              {classement.prix_reference && t('suivi.classement.prixReference', { p: afficherMontant(classement.prix_reference, loc) })}
              {nous && !gagnante.est_nous && nous.rang !== null && <>
                {classement.prix_reference ? ' · ' : ''}{t('suivi.classement.votreRang', { rang: nous.rang })}
                {classement.ecart_avec_gagnante && <> · {t('suivi.classement.ecart', {
                  ecart: afficherMontant(String(Math.abs(Number(classement.ecart_avec_gagnante))), loc),
                  sens: Number(classement.ecart_avec_gagnante) > 0 ? t('suivi.classement.auDessus') : t('suivi.classement.enDessous'),
                })}</>}
              </>}
              {nous && nous.issue && nous.issue !== 'retenue' && <> · {t('suivi.classement.vousEcarte')}</>}
            </span>
          </div>
        </div>
      )}

      {etroit ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {ordre.map(o => (
            <li key={o.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 0', borderBottom: '1px solid var(--adj-hairline)' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontWeight: 'var(--adj-w-semi)' as never, color: 'var(--adj-ink)' }}>
                  {o.nom}{o.est_nous && ` (${t('suivi.vous')})`}
                </span>
                <span className="adj-fig">{afficherMontant(montantRetenu(o), loc)}</span>
              </span>
              <span style={{ fontSize: 'var(--adj-t-sm)' }}><Issue o={o} /> · <Mesure o={o} nature={nature} /></span>
            </li>
          ))}
        </ul>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>{t('suivi.classement.col.resultat')}</th>
              <th style={th}>{t('suivi.classement.col.soumissionnaire')}</th>
              <th style={{ ...th, textAlign: 'right' }}>{t('suivi.classement.col.montant')}</th>
              {nature === 'etudes' && <th style={{ ...th, textAlign: 'right' }}>{t('suivi.classement.col.noteFinanciere')}</th>}
              <th style={{ ...th, textAlign: 'right' }}>{t(`suivi.classement.col.${colonneMesure}`)}</th>
            </tr>
          </thead>
          <tbody>
            {ordre.map(o => (
              <tr key={o.id} style={{ background: o.est_nous ? 'var(--adj-brand-tint)' : undefined }}>
                <td style={td}><Issue o={o} /></td>
                <td style={{ ...td, color: 'var(--adj-ink)', fontWeight: (o.est_nous ? 'var(--adj-w-semi)' : 'var(--adj-w-normal)') as never }}>
                  {o.nom}{o.est_nous && ` (${t('suivi.vous')})`}
                </td>
                <td className="adj-fig" style={{ ...td, textAlign: 'right' }}>{afficherMontant(montantRetenu(o), loc) || '-'}</td>
                {nature === 'etudes' && <td className="adj-fig" style={{ ...td, textAlign: 'right' }}>{afficherNombre(o.note_financiere, loc) || '-'}</td>}
                <td className="adj-fig" style={{ ...td, textAlign: 'right' }}><Mesure o={o} nature={nature} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {classement.avertissements.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {classement.avertissements.map(a => (
            <li key={a} style={{ display: 'flex', gap: 8, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)', lineHeight: 'var(--adj-lead-body)' as never }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 3 }} color="var(--adj-hold)" aria-hidden />
              {t(`suivi.avertissement.${a}`, { defaultValue: a })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
