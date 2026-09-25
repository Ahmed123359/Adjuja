// Recherche globale, en palette -- 2026-09-25.
//
// Le champ inline de la barre du haut posait deux problèmes : il occupait 280px
// en permanence pour un usage occasionnel, et sa liste de résultats sortait sous
// une barre qui n'a que 82px de haut, donc à l'étroit.
//
// En palette, la recherche a la place de montrer ce qu'elle trouve, et surtout
// elle peut garder un historique : on cherche presque toujours le même dossier
// deux fois dans la journée. L'historique est local au navigateur -- rien
// justifie d'envoyer au serveur ce que quelqu'un tape pour lui-même.
//
// Ouverture au clavier par Ctrl/⌘+K, la convention de toutes les palettes.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, CornerDownLeft, Search, X } from 'lucide-react';
import { useRessource } from '../lib/cache';
import { fetchAos } from '../../features/ao/api';
import type { AoSummary } from '../../types';

const CLE_HISTORIQUE = 'adjuja.search.history';
const MAX_HISTORIQUE = 6;

function lireHistorique(): string[] {
  // Navigation privée, stockage bloqué, quota plein : l'historique est un
  // confort, son échec ne doit jamais empêcher de chercher.
  try {
    const brut = localStorage.getItem(CLE_HISTORIQUE);
    const valeurs = brut ? JSON.parse(brut) : [];
    return Array.isArray(valeurs) ? valeurs.filter(v => typeof v === 'string') : [];
  } catch { return []; }
}

function ecrireHistorique(valeurs: string[]): void {
  try { localStorage.setItem(CLE_HISTORIQUE, JSON.stringify(valeurs)); } catch { /* stockage indisponible */ }
}

export function SearchPalette({
  open, onClose, onOpenAo,
}: {
  open: boolean;
  onClose: () => void;
  onOpenAo?: () => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  // Meme cle 'ao:list' que le reste du produit : la palette s'ouvre sur une
  // liste deja chargee, et filtre localement plutot qu'une requete par frappe.
  const { data: aosCache, loading: aosLoading } = useRessource<AoSummary[]>(
    open ? 'ao:list' : null, fetchAos,
  );
  const aos: AoSummary[] | null = aosLoading ? null : (aosCache ?? []);
  const [historique, setHistorique] = useState<string[]>([]);
  const [survol, setSurvol] = useState(0);
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setSurvol(0);
    setHistorique(lireHistorique());
    // Le focus doit arriver après la peinture, sinon l'élément n'existe pas
    // encore quand on l'appelle.
    const id = requestAnimationFrame(() => champ.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [open]);

  const resultats = useMemo(() => {
    const terme = q.trim().toLowerCase();
    if (!terme || !aos) return [];
    return aos
      .filter(a =>
        (a.reference ?? '').toLowerCase().includes(terme) ||
        (a.objet ?? '').toLowerCase().includes(terme) ||
        (a.acheteur ?? '').toLowerCase().includes(terme))
      .slice(0, 8);
  }, [q, aos]);

  useEffect(() => { setSurvol(0); }, [q]);

  const retenir = (terme: string) => {
    const propre = terme.trim();
    if (!propre) return;
    // Le terme remonte en tête sans jamais être dupliqué.
    const suivant = [propre, ...historique.filter(h => h !== propre)].slice(0, MAX_HISTORIQUE);
    setHistorique(suivant);
    ecrireHistorique(suivant);
  };

  const ouvrir = (ao: AoSummary) => {
    retenir(q);
    onClose();
    onOpenAo?.();
  };

  const touche = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSurvol(i => Math.min(i + 1, resultats.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSurvol(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const choix = resultats[survol];
      if (choix) ouvrir(choix);
    }
  };

  if (!open) return null;

  const videEtSansTerme = q.trim().length === 0;

  return (
    <div
      className="adj-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 140,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        // La palette se pose dans le premier tiers : au centre exact, la liste
        // qui se déploie vers le bas déborde de l'écran.
        padding: '12vh var(--adj-4) var(--adj-4)',
        background: 'rgba(16, 21, 41, 0.5)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        className="adj-pop"
        role="dialog"
        aria-modal="true"
        aria-label={t('app.topbar.searchPlaceholder')}
        style={{
          width: '100%', maxWidth: 620,
          maxHeight: 'min(60vh, 520px)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--adj-panel)',
          border: '1px solid var(--adj-hairline)',
          borderRadius: 'var(--adj-round-l)',
          boxShadow: 'var(--adj-lift-3)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          padding: '0 16px', height: 58,
          borderBottom: '1px solid var(--adj-hairline)',
        }}>
          <Search size={18} strokeWidth={1.9} color="var(--adj-ink-4)" style={{ flexShrink: 0 }} />
          <input
            ref={champ}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={touche}
            placeholder={t('app.topbar.searchPlaceholder')}
            aria-label={t('app.topbar.searchPlaceholder')}
            style={{
              flex: 1, minWidth: 0, height: '100%',
              border: 'none', outline: 'none', background: 'transparent',
              color: 'var(--adj-ink)', fontFamily: 'inherit',
              fontSize: 'var(--adj-t-md)',
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('app.topbar.searchClear')}
            className="adj-focusable"
            style={{
              display: 'flex', flexShrink: 0, padding: 6, border: 'none',
              background: 'transparent', borderRadius: 'var(--adj-round-s)',
              color: 'var(--adj-ink-4)', cursor: 'pointer',
            }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="adj-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8 }}>
          {/* Sans terme saisi, la palette propose ce qui a déjà été cherché :
              c'est le cas le plus fréquent, on rouvre le même dossier. */}
          {videEtSansTerme && historique.length > 0 && (
            <>
              <span style={{
                display: 'block', padding: '6px 10px 8px',
                fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-4)',
              }}>
                {t('app.topbar.searchRecent')}
              </span>
              {historique.map(h => (
                <button
                  key={h}
                  type="button"
                  onClick={() => { setQ(h); champ.current?.focus(); }}
                  className="adj-focusable"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '10px', border: 'none', background: 'transparent',
                    borderRadius: 'var(--adj-round-s)', cursor: 'pointer',
                    textAlign: 'left', fontFamily: 'inherit',
                    fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--adj-panel-2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Clock size={15} strokeWidth={1.8} color="var(--adj-ink-4)" style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h}
                  </span>
                </button>
              ))}
            </>
          )}

          {videEtSansTerme && historique.length === 0 && (
            <p style={{ margin: 0, padding: '18px 10px', fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
              {t('app.topbar.searchHint')}
            </p>
          )}

          {!videEtSansTerme && aos === null && (
            <p style={{ margin: 0, padding: '18px 10px', fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
              {t('dashboard.home.loading')}
            </p>
          )}

          {!videEtSansTerme && aos !== null && resultats.length === 0 && (
            <p style={{ margin: 0, padding: '18px 10px', fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
              {t('app.topbar.searchEmpty')}
            </p>
          )}

          {resultats.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => ouvrir(a)}
              onMouseEnter={() => setSurvol(i)}
              className="adj-focusable"
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '10px', border: 'none',
                background: i === survol ? 'var(--adj-brand-tint)' : 'transparent',
                borderRadius: 'var(--adj-round-s)', cursor: 'pointer',
                textAlign: 'left', fontFamily: 'inherit',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{
                  fontSize: 'var(--adj-t-sm)', fontWeight: 'var(--adj-w-semi)' as never,
                  color: 'var(--adj-ink)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {a.reference || t('pipeline.detail.noRef')}
                </span>
                <span style={{
                  fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {a.objet || '-'}
                </span>
              </span>
              {i === survol && (
                <CornerDownLeft size={15} strokeWidth={1.8} color="var(--adj-ink-4)" style={{ flexShrink: 0 }} />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
