// Assistant de l'etape, en colonne -- 2026-09-25.
//
// Remplace le tiroir replie au bas du panneau d'etape. Trois defauts y
// rendaient l'assistant inutile en pratique :
//
//   1. **il etait ferme et sous la ligne de flottaison** : personne ne l'ouvre ;
//   2. **il commencait par un champ vide**, ce qui demande a l'utilisateur de
//      savoir quoi demander. A chaque etape ce sont pourtant presque toujours
//      les deux ou trois memes questions qui font avancer le dossier : elles
//      sont donc proposees, et viennent du serveur avec le cadrage de l'etape ;
//   3. **la reponse etait un cul-de-sac.** On lisait un paragraphe, puis on le
//      recopiait a la main ailleurs. Chaque reponse porte maintenant ses
//      suites : en faire une tache, la copier.
//
// La conversation est persistee par couple (dossier, etape) : un dossier se
// prepare sur plusieurs jours, et l'analyse d'hier ne doit pas etre a refaire.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check, Copy, ListPlus, RotateCcw, SendHorizonal, Sparkles, X,
} from 'lucide-react';
import { authHeaders, readJson } from '../../../shared/lib/http';
import { createTask } from '../../dashboard/api';
import { invalider } from '../../../shared/lib/cache';
import { askStepAssistant } from '../api';
import type { AoStepKey } from '../types';

type Tour = { role: 'user' | 'assistant'; content: string; sources?: string[] };

type Contexte = {
  role: string;
  suggestions: string[];
  history: { role: 'user' | 'assistant'; content: string; sources?: string[] }[];
};

export function StepAssistant({
  aoId, stepKey, onClose,
}: {
  aoId: string;
  stepKey: AoStepKey;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const [tours, setTours] = useState<Tour[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [intro, setIntro] = useState('');
  const [question, setQuestion] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Retour visuel d'une action : l'index du tour, et ce qui vient d'etre fait. */
  const [fait, setFait] = useState<{ i: number; quoi: 'copie' | 'tache' } | null>(null);
  const bas = useRef<HTMLDivElement>(null);

  /** Le contexte, les suggestions et l'historique arrivent en un seul appel, qui
   *  ne consomme aucun jeton LLM. */
  const charger = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/ao/${aoId}/steps/${stepKey}/assist`, { headers: authHeaders() });
      const ctx = await readJson<Contexte>(res, 'Erreur assistant.');
      setIntro(ctx.role ?? '');
      setSuggestions(ctx.suggestions ?? []);
      setTours((ctx.history ?? []).map(m => ({ role: m.role, content: m.content, sources: m.sources })));
    } catch {
      // L'assistant est un appoint : son indisponibilite ne doit pas empecher
      // de travailler l'etape.
      setSuggestions([]);
    }
  }, [aoId, stepKey]);

  useEffect(() => {
    setTours([]);
    setQuestion('');
    setErreur(null);
    charger();
  }, [charger]);

  useEffect(() => { bas.current?.scrollIntoView({ block: 'end' }); }, [tours, enCours]);

  const demander = async (texte: string) => {
    const q = texte.trim();
    if (!q || enCours) return;

    const historique: Tour[] = [...tours, { role: 'user', content: q }];
    setTours(historique);
    setQuestion('');
    setEnCours(true);
    setErreur(null);
    try {
      const rep = await askStepAssistant(
        aoId, stepKey,
        historique.map(m => ({ role: m.role, content: m.content })),
      );
      setTours(l => [...l, { role: 'assistant', content: rep.answer, sources: rep.sources }]);
    } catch (e) {
      // La question reste affichee : la retirer donnerait l'impression qu'elle
      // n'a jamais ete posee.
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCours(false);
    }
  };

  const vider = async () => {
    try {
      await fetch(`/api/v1/ao/${aoId}/steps/${stepKey}/assist`, { method: 'DELETE', headers: authHeaders() });
    } catch { /* le fil local est vide quand meme */ }
    setTours([]);
  };

  /* ------------------------------------------------- suites d'une reponse */

  const copier = async (texte: string, i: number) => {
    try {
      await navigator.clipboard.writeText(texte);
      setFait({ i, quoi: 'copie' });
      setTimeout(() => setFait(null), 1600);
    } catch { /* presse-papier refuse (page non securisee) */ }
  };

  /** Une reponse devient une tache du dossier : c'est la suite la plus
   *  frequente -- « il manque telle piece » se traduit par « aller la
   *  chercher ». La premiere ligne fait le titre, le reste la description. */
  const enTache = async (texte: string, i: number) => {
    const lignes = texte.trim().split('\n').filter(l => l.trim());
    const titre = (lignes[0] ?? texte).replace(/^[-*#\s]+/, '').slice(0, 180);
    try {
      await createTask({ titre, description: texte, ao_id: aoId });
      invalider('dashboard');
      setFait({ i, quoi: 'tache' });
      setTimeout(() => setFait(null), 2200);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };

  /* ------------------------------------------------------------- rendu */

  const actionStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 9px', borderRadius: 'var(--adj-round-s)',
    border: '1px solid var(--adj-hairline)', background: 'var(--adj-panel)',
    color: 'var(--adj-ink-3)', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 'var(--adj-t-xs)',
  };

  return (
    <section style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0, minWidth: 0,
      background: 'var(--adj-panel)',
      border: '1px solid var(--adj-hairline)',
      borderRadius: 'var(--adj-round-l)',
      overflow: 'hidden',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 'var(--adj-2)', flexShrink: 0,
        padding: 'var(--adj-4) var(--adj-pad)',
        borderBottom: '1px solid var(--adj-hairline)',
      }}>
        <Sparkles size={17} strokeWidth={2} color="var(--adj-brand)" style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{
            fontSize: 'var(--adj-t-sm)', fontWeight: 'var(--adj-w-semi)' as never,
            color: 'var(--adj-ink)',
          }}>
            {t('pipeline.assist.title')}
          </span>
          <span style={{
            fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {t(`pipeline.steps.${stepKey}.title`, { defaultValue: stepKey })}
          </span>
        </span>

        {tours.length > 0 && (
          <button
            type="button" onClick={vider} className="adj-focusable"
            aria-label={t('pipeline.assist.clear')} title={t('pipeline.assist.clear')}
            style={{ display: 'flex', padding: 5, border: 'none', background: 'transparent',
                     borderRadius: 'var(--adj-round-s)', color: 'var(--adj-ink-4)', cursor: 'pointer' }}
          >
            <RotateCcw size={15} strokeWidth={1.9} />
          </button>
        )}
        {onClose && (
          <button
            type="button" onClick={onClose} className="adj-focusable"
            aria-label={t('pipeline.assist.close')} title={t('pipeline.assist.close')}
            style={{ display: 'flex', padding: 5, border: 'none', background: 'transparent',
                     borderRadius: 'var(--adj-round-s)', color: 'var(--adj-ink-4)', cursor: 'pointer' }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        )}
      </header>

      <div className="adj-scroll" style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: 'var(--adj-4) var(--adj-pad)',
        display: 'flex', flexDirection: 'column', gap: 'var(--adj-4)',
      }}>
        {tours.length === 0 && (
          <>
            {intro && (
              <p style={{ margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)', lineHeight: 1.6 }}>
                {intro}
              </p>
            )}
            {/* Les suites proposees d'entree : ce sont elles qui rendent
                l'assistant utilisable sans savoir quoi lui demander. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--adj-2)' }}>
              {suggestions.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => demander(s)}
                  className="adj-focusable adj-anim"
                  style={{
                    textAlign: 'left', padding: '10px 12px',
                    borderRadius: 'var(--adj-round-m)',
                    border: '1px solid var(--adj-hairline)',
                    background: 'var(--adj-panel-2)', color: 'var(--adj-ink-2)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 'var(--adj-t-sm)', lineHeight: 1.45,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--adj-brand)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--adj-hairline)'; }}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {tours.map((tour, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <span style={{
              fontSize: 'var(--adj-t-xs)', fontWeight: 'var(--adj-w-semi)' as never,
              color: tour.role === 'user' ? 'var(--adj-ink-3)' : 'var(--adj-brand)',
            }}>
              {tour.role === 'user' ? t('pipeline.assist.you') : t('pipeline.assist.title')}
            </span>

            <p style={{
              margin: 0, fontSize: 'var(--adj-t-sm)', lineHeight: 1.65,
              color: 'var(--adj-ink-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {tour.content}
            </p>

            {/* Une reponse n'est pas un cul-de-sac : elle se transforme. */}
            {tour.role === 'assistant' && (
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                <button
                  type="button" style={actionStyle} className="adj-focusable"
                  onClick={() => enTache(tour.content, i)}
                >
                  {fait?.i === i && fait.quoi === 'tache'
                    ? <><Check size={13} strokeWidth={2.6} color="var(--adj-pos)" />{t('pipeline.assist.taskCreated')}</>
                    : <><ListPlus size={13} strokeWidth={2} />{t('pipeline.assist.toTask')}</>}
                </button>
                <button
                  type="button" style={actionStyle} className="adj-focusable"
                  onClick={() => copier(tour.content, i)}
                >
                  {fait?.i === i && fait.quoi === 'copie'
                    ? <><Check size={13} strokeWidth={2.6} color="var(--adj-pos)" />{t('pipeline.assist.copied')}</>
                    : <><Copy size={13} strokeWidth={2} />{t('pipeline.assist.copy')}</>}
                </button>
              </span>
            )}

            {tour.sources && tour.sources.length > 0 && (
              <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-4)', lineHeight: 1.5 }}>
                {t('pipeline.assist.sources')} : {tour.sources.join(' · ')}
              </span>
            )}
          </div>
        ))}

        {enCours && (
          <p style={{ margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
            {t('pipeline.assist.thinking')}
          </p>
        )}
        {erreur && (
          <p role="alert" style={{ margin: 0, fontSize: 'var(--adj-t-xs)', color: 'var(--adj-neg)' }}>
            {erreur}
          </p>
        )}
        <div ref={bas} />
      </div>

      <div style={{
        flexShrink: 0, padding: 'var(--adj-3) var(--adj-pad) var(--adj-4)',
        borderTop: '1px solid var(--adj-hairline)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 'var(--adj-2)',
          padding: 'var(--adj-2)',
          border: '1px solid var(--adj-edge)', borderRadius: 'var(--adj-round-m)',
        }}>
          <textarea
            value={question}
            rows={1}
            onChange={e => {
              setQuestion(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); demander(question); }
            }}
            placeholder={t('pipeline.assist.placeholder')}
            aria-label={t('pipeline.assist.placeholder')}
            style={{
              flex: 1, minWidth: 0, resize: 'none', border: 'none', outline: 'none',
              background: 'transparent', color: 'var(--adj-ink)',
              fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)', lineHeight: 1.5,
              padding: '7px 6px', maxHeight: 120,
            }}
          />
          <button
            type="button"
            onClick={() => demander(question)}
            disabled={!question.trim() || enCours}
            aria-label={t('pipeline.assist.send')}
            className="adj-focusable adj-anim"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              width: 34, height: 34, borderRadius: 'var(--adj-round-s)', border: 'none',
              background: question.trim() ? 'var(--adj-brand)' : 'var(--adj-panel-2)',
              color: question.trim() ? '#fff' : 'var(--adj-ink-4)',
              cursor: question.trim() && !enCours ? 'pointer' : 'not-allowed',
            }}
          >
            <SendHorizonal size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    </section>
  );
}
