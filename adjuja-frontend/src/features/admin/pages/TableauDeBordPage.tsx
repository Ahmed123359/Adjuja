// Administration : tableau de bord -- 2026-10-01.
//
// Référence retenue : un pupitre de poste d'aiguillage. Tout est calme, seul
// ce qui est anormal s'allume. D'où l'ordre :
//   1. « À surveiller » : uniquement ce qui demande une intervention, chaque
//      ligne mène à l'écran où l'on agit. Rien d'anormal : une phrase le dit.
//   2. Le registre des chiffres (clients, activité) : libellé à gauche,
//      chiffre à droite, contexte dessous. Pas de tuiles à pastille d'icône,
//      rejetées dans ui-context.md.
//   3. Deux séries sur 30 jours (inscriptions, dossiers créés), en barres :
//      des comptes par jour, une série par graphique, une seule couleur.
// Rien d'inventé : le revenu est présenté comme une estimation, parce
// qu'aucun montant encaissé n'est enregistré.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react';
import { useRessource } from '../../../shared/lib/cache';
import { Button } from '../../../shared/ui/Button';
import { fetchTableauDeBord } from '../api';
import type { PointJour, TableauDeBord } from '../types';
import { Chargement, MessageErreur, PageAdmin, Section, locale } from '../components/ui';

/* --------------------------------------------------------- à surveiller */

type Alerte = { n: number; cle: string; vers: string };

function alertes(d: TableauDeBord): Alerte[] {
  return [
    { n: d.paiements_en_retard, cle: 'paiements', vers: '/admin/abonnements' },
    { n: d.echeances_7j, cle: 'echeances', vers: '/admin/abonnements' },
    { n: d.veille_sources_en_retard, cle: 'sources', vers: '/admin/veille/sources' },
    { n: d.veille_champs_en_alerte, cle: 'remplissage', vers: '/admin/veille/remplissage' },
    { n: d.veille_dce_en_echec, cle: 'dce', vers: '/admin/veille/dce' },
    { n: d.comptes_suspendus, cle: 'suspendus', vers: '/admin/comptes' },
  ].filter(a => a.n > 0);
}

function ASurveiller({ d }: { d: TableauDeBord }) {
  const { t } = useTranslation();
  const liste = alertes(d);
  return (
    <Section titre={t('admin.tableau.surveiller')}>
      {liste.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--adj-pos)', fontWeight: 'var(--adj-w-semi)' as never }}>
          {t('admin.tableau.rienASignaler')}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {liste.map(a => (
            <li key={a.cle}>
              <Link to={a.vers} className="adj-row adj-focusable" style={{
                display: 'flex', alignItems: 'center', gap: 'var(--adj-3)', padding: '12px 0',
                borderBottom: '1px solid var(--adj-hairline)', textDecoration: 'none', color: 'var(--adj-ink)',
              }}>
                <AlertTriangle size={17} strokeWidth={2} color="var(--adj-neg)" aria-hidden style={{ flexShrink: 0 }} />
                <span className="adj-fig" style={{ minWidth: 36, fontWeight: 'var(--adj-w-bold)' as never, color: 'var(--adj-neg)' }}>{a.n}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{t(`admin.tableau.alerte.${a.cle}`, { count: a.n })}</span>
                <ChevronRight size={17} color="var(--adj-ink-4)" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* --------------------------------------------------------------- registre */

function Ligne({ libelle, valeur, contexte }: { libelle: string; valeur: React.ReactNode; contexte?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--adj-4)',
      padding: '12px 0', borderBottom: '1px solid var(--adj-hairline)',
    }}>
      <span style={{ color: 'var(--adj-ink-2)' }}>{libelle}</span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, textAlign: 'right' }}>
        <span className="adj-fig" style={{ fontSize: 'var(--adj-t-md)', fontWeight: 'var(--adj-w-bold)' as never, color: 'var(--adj-ink)' }}>{valeur}</span>
        {contexte && <span className="adj-fig" style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)' }}>{contexte}</span>}
      </span>
    </div>
  );
}

function Registre({ d }: { d: TableauDeBord }) {
  const { t, i18n } = useTranslation();
  const loc = locale(i18n.language);
  const offres = ['free', 'starter', 'pro', 'enterprise']
    .map(c => `${t(`admin.offres.${c}`)} ${d.organisations_par_offre[c] ?? 0}`).join(' · ');
  return (
    <div className="adj-grid" style={{ gap: 'var(--adj-8)' }}>
      <div className="adj-1-2" style={{ minWidth: 0 }}>
        <Section titre={t('admin.tableau.clients')}>
          <div>
            <Ligne libelle={t('admin.tableau.comptes')} valeur={d.comptes_total}
              contexte={t('admin.tableau.nouveaux', { j7: d.comptes_nouveaux.j7, j30: d.comptes_nouveaux.j30 })} />
            <Ligne libelle={t('admin.tableau.actifs')} valeur={d.comptes_actifs.j30}
              contexte={t('admin.tableau.actifsContexte', { j7: d.comptes_actifs.j7 })} />
            <Ligne libelle={t('admin.tableau.organisations')} valeur={d.organisations_total} contexte={offres} />
            <Ligne libelle={t('admin.tableau.revenu')}
              valeur={t('admin.tableau.mad', { n: d.revenu_mensuel_estime_mad.toLocaleString(loc) })}
              contexte={t('admin.tableau.revenuContexte')} />
          </div>
        </Section>
      </div>
      <div className="adj-1-2" style={{ minWidth: 0 }}>
        <Section titre={t('admin.tableau.activite')}>
          <div>
            <Ligne libelle={t('admin.tableau.dossiers')} valeur={d.dossiers_crees.j30}
              contexte={t('admin.tableau.sur7', { n: d.dossiers_crees.j7 })} />
            <Ligne libelle={t('admin.tableau.generations')} valeur={d.generations.j30}
              contexte={t('admin.tableau.sur7', { n: d.generations.j7 })} />
            <Ligne libelle={t('admin.tableau.abonnementsActifs')} valeur={d.abonnements_par_statut.active ?? 0}
              contexte={t('admin.tableau.abonnementsContexte', {
                retard: d.abonnements_par_statut.past_due ?? 0, annules: d.abonnements_par_statut.canceled ?? 0,
              })} />
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- séries */

// Hauteur de la zone de tracé ; les barres s'ancrent sur la ligne de base.
const HAUTEUR = 140;

function Barres({ titre, points, unite }: { titre: string; points: PointJour[]; unite: string }) {
  const { t, i18n } = useTranslation();
  const loc = locale(i18n.language);
  const [actif, setActif] = useState<number | null>(null);
  const max = Math.max(1, ...points.map(p => p.valeur));
  const total = points.reduce((s, p) => s + p.valeur, 0);
  const jour = (iso: string, long = false) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(loc, long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });
  const reperes = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--adj-3)', minWidth: 0 }}>
      <figcaption style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--adj-3)', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 'var(--adj-w-semi)' as never, color: 'var(--adj-ink)' }}>{titre}</span>
        <span className="adj-fig" style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
          {t('admin.tableau.total30', { n: total })}
        </span>
      </figcaption>

      <div style={{ display: 'flex', gap: 'var(--adj-2)' }}>
        {/* Axe : seulement le maximum et zéro, en encre discrète. */}
        <div aria-hidden className="adj-fig" style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: HAUTEUR,
          fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-4)', textAlign: 'right', minWidth: 22,
        }}>
          <span>{max}</span><span>0</span>
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <div
            role="list"
            aria-label={titre}
            style={{
              display: 'flex', alignItems: 'flex-end', gap: 2, height: HAUTEUR,
              borderBottom: '1px solid var(--adj-edge)',
            }}
            onMouseLeave={() => setActif(null)}
          >
            {points.map((p, i) => (
              // La zone de survol couvre toute la colonne, plus grande que la barre.
              <button
                key={p.jour}
                role="listitem"
                aria-label={`${jour(p.jour, true)} : ${p.valeur} ${unite}`}
                onMouseEnter={() => setActif(i)}
                onFocus={() => setActif(i)}
                onBlur={() => setActif(null)}
                className="adj-focusable"
                style={{
                  flex: 1, minWidth: 0, height: '100%', padding: 0, border: 'none', background: 'transparent',
                  display: 'flex', alignItems: 'flex-end', cursor: 'default',
                }}
              >
                <span style={{
                  display: 'block', width: '100%',
                  height: p.valeur ? `${Math.max(3, (p.valeur / max) * 100)}%` : 0,
                  borderRadius: '4px 4px 0 0',
                  background: 'var(--adj-brand)',
                  opacity: actif === null || actif === i ? 1 : 0.45,
                  transition: 'opacity .12s',
                }} />
              </button>
            ))}
          </div>
          {actif !== null && (
            <div role="status" className="adj-pop adj-fig" style={{
              position: 'absolute', top: -6,
              left: `${((actif + 0.5) / points.length) * 100}%`,
              transform: `translate(${actif > points.length * 0.7 ? '-100%' : actif < points.length * 0.3 ? '0' : '-50%'}, -100%)`,
              padding: '6px 10px', borderRadius: 'var(--adj-round-s)', whiteSpace: 'nowrap',
              background: 'var(--adj-panel)', boxShadow: 'var(--adj-lift-2)', border: '1px solid var(--adj-hairline)',
              fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-2)', pointerEvents: 'none',
            }}>
              {jour(points[actif].jour, true)} · <strong style={{ color: 'var(--adj-ink)' }}>{points[actif].valeur}</strong> {unite}
            </div>
          )}
          <div aria-hidden style={{ position: 'relative', height: 20, marginTop: 6, fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-4)' }}>
            {reperes.map((i, k) => (
              <span key={i} style={{
                position: 'absolute', whiteSpace: 'nowrap',
                left: k === 0 ? 0 : k === 2 ? undefined : '50%',
                right: k === 2 ? 0 : undefined,
                transform: k === 1 ? 'translateX(-50%)' : undefined,
              }}>
                {jour(points[i].jour)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Les valeurs, lisibles sans le graphique (lecteur d'écran, impression). */}
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--adj-t-xs)', color: 'var(--adj-brand)' }}>{t('admin.tableau.voirValeurs')}</summary>
        <ul className="adj-fig" style={{
          margin: '8px 0 0', padding: 0, listStyle: 'none', columns: 3, fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-2)',
        }}>
          {points.map(p => <li key={p.jour}>{jour(p.jour)} : {p.valeur}</li>)}
        </ul>
      </details>
    </figure>
  );
}

/* ----------------------------------------------------------------- écran */

export default function TableauDeBordPage() {
  const { t, i18n } = useTranslation();
  const tableau = useRessource('admin:tableau', fetchTableauDeBord);
  const d = tableau.data;
  const heure = d ? new Date(d.genere_le).toLocaleTimeString(locale(i18n.language), { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <PageAdmin
      titre={t('admin.nav.tableau')}
      sousTitre={heure ? t('admin.veille.misAJour', { heure }) : t('admin.pages.tableau')}
      actions={
        <Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={tableau.refresh}>
          {t('admin.actualiser')}
        </Button>
      }
    >
      {tableau.erreur && !d && <MessageErreur erreur={tableau.erreur} />}
      {tableau.loading && <Chargement />}
      {d && (
        <>
          <ASurveiller d={d} />
          <Registre d={d} />
          <Section titre={t('admin.tableau.trenteJours')}>
            <div className="adj-grid" style={{ gap: 'var(--adj-8)' }}>
              <div className="adj-1-2" style={{ minWidth: 0 }}>
                <Barres titre={t('admin.tableau.inscriptions')} points={d.inscriptions_30j} unite={t('admin.tableau.uniteInscriptions')} />
              </div>
              <div className="adj-1-2" style={{ minWidth: 0 }}>
                <Barres titre={t('admin.tableau.dossiersCrees')} points={d.dossiers_30j} unite={t('admin.tableau.uniteDossiers')} />
              </div>
            </div>
          </Section>
        </>
      )}
    </PageAdmin>
  );
}
