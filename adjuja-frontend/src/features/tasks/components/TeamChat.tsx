// Discussion d'équipe -- 2026-09-25.
//
// Occupe toute la hauteur de la colonne de droite, du haut de l'écran au bas :
// une conversation se lit de haut en bas et s'écrit en bas, elle ne tient pas
// dans une carte de 300px.
//
// Le fil suit la sélection : aucune tâche sélectionnée, c'est le canal général
// de l'équipe ; une tâche sélectionnée, c'est le fil de cette tâche. Ce sont
// deux fils distincts côté serveur, pas un filtre d'affichage -- sans quoi le
// canal général finirait noyé sous les échanges de chaque tâche.
//
// Deux mécanismes de citation, tous deux réels :
//   - `@` propose les membres de l'organisation et joint leurs identifiants au
//     message, ce qui permettra de notifier plus tard ;
//   - `#` propose les dossiers et leurs documents. Le libellé est figé à
//     l'écriture côté serveur : un fil doit rester lisible tel qu'il a été
//     écrit, même si la pièce est renommée ou supprimée ensuite.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AtSign, Paperclip, SendHorizonal, Trash2 } from 'lucide-react';
import type { User } from '../../../types';
import type { AoSummary } from '../../ao/types';
import type { Task } from '../../dashboard/types';
import { deleteMessage, fetchMessages, postMessage } from '../api';
import type { Message, MessageRef } from '../types';

type Suggestion = { cle: string; libelle: string; detail?: string };

export function TeamChat({
  tache, membres, aos, moi,
}: {
  /** Fil courant. Absent, c'est le canal général de l'équipe. */
  tache: Task | null;
  membres: User[];
  aos: AoSummary[];
  moi: User | null;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR';

  const [messages, setMessages] = useState<Message[]>([]);
  const [chargement, setChargement] = useState(true);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Ce qui a été réellement cité : le texte seul ne suffit pas, deux membres
  // peuvent porter le même nom.
  const [mentions, setMentions] = useState<string[]>([]);
  const [refs, setRefs] = useState<MessageRef[]>([]);

  const [jeton, setJeton] = useState<{ type: '@' | '#'; terme: string } | null>(null);
  const [survol, setSurvol] = useState(0);

  const zone = useRef<HTMLTextAreaElement>(null);
  const bas = useRef<HTMLDivElement>(null);

  const charger = useCallback(() => {
    setChargement(true);
    fetchMessages(tache?.id ?? null)
      .then(r => setMessages(r.items))
      .catch(e => setErreur(e instanceof Error ? e.message : String(e)))
      .finally(() => setChargement(false));
  }, [tache?.id]);

  useEffect(() => {
    // Changer de fil remet tout à zéro : garder un brouillon d'un fil dans un
    // autre est le meilleur moyen de l'envoyer au mauvais endroit.
    setTexte('');
    setMentions([]);
    setRefs([]);
    setJeton(null);
    charger();
  }, [charger]);

  // On arrive toujours en bas d'une conversation : c'est là qu'est le dernier
  // message.
  useEffect(() => {
    bas.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  /* ------------------------------------------------------- saisie et citation */

  /** Repère un `@` ou `#` en cours de frappe : celui qui précède le curseur et
   *  n'est pas encore refermé par une espace. */
  const relireJeton = (valeur: string, curseur: number) => {
    const avant = valeur.slice(0, curseur);
    const m = /(^|\s)([@#])([\p{L}\p{N}_.-]*)$/u.exec(avant);
    if (!m) { setJeton(null); return; }
    setJeton({ type: m[2] as '@' | '#', terme: m[3].toLowerCase() });
    setSurvol(0);
  };

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!jeton) return [];
    if (jeton.type === '@') {
      return membres
        .filter(m => `${m.prenom} ${m.nom}`.toLowerCase().includes(jeton.terme))
        .slice(0, 6)
        .map(m => ({ cle: m.id, libelle: `${m.prenom} ${m.nom}`.trim(), detail: m.email }));
    }
    return aos
      .filter(a =>
        (a.reference ?? '').toLowerCase().includes(jeton.terme) ||
        (a.objet ?? '').toLowerCase().includes(jeton.terme))
      .slice(0, 6)
      .map(a => ({ cle: a.id, libelle: a.reference || a.objet || a.id.slice(0, 8), detail: a.objet }));
  }, [jeton, membres, aos]);

  const choisir = (s: Suggestion) => {
    if (!jeton) return;
    const el = zone.current;
    const curseur = el?.selectionStart ?? texte.length;
    const avant = texte.slice(0, curseur);
    const apres = texte.slice(curseur);
    // Le jeton en cours est remplacé par le libellé complet, pas complété : on
    // veut « @Hafido Laadimi », pas « @haf Laadimi ».
    const remplace = avant.replace(/(^|\s)([@#])([\p{L}\p{N}_.-]*)$/u, `$1$2${s.libelle} `);

    setTexte(remplace + apres);
    if (jeton.type === '@') setMentions(m => [...new Set([...m, s.cle])]);
    else setRefs(r => [...r, { type: 'ao', id: s.cle, label: s.libelle }]);
    setJeton(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = remplace.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const envoyer = async () => {
    const corps = texte.trim();
    if (!corps || envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      // Seules les citations encore présentes dans le texte partent : effacer
      // « @Sara » puis envoyer ne doit pas la notifier quand même.
      const message = await postMessage({
        body: corps,
        task_id: tache?.id ?? null,
        mentions: mentions.filter(id => {
          const m = membres.find(x => x.id === id);
          return m ? corps.includes(`${m.prenom} ${m.nom}`.trim()) : false;
        }),
        refs: refs.filter(r => corps.includes(r.label)),
      });
      setMessages(l => [...l, message]);
      setTexte('');
      setMentions([]);
      setRefs([]);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = async (id: string) => {
    try {
      await deleteMessage(id);
      setMessages(l => l.filter(m => m.id !== id));
    } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); }
  };

  const touche = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (jeton && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSurvol(i => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSurvol(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choisir(suggestions[survol]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setJeton(null); return; }
    }
    // Entrée envoie, Maj+Entrée passe à la ligne : la convention de toutes les
    // messageries.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); }
  };

  /* ----------------------------------------------------------------- rendu */

  /** Met en évidence les `@` et `#` dans un message rendu. Le corps est du
   *  texte, jamais du HTML : rien de ce qu'un membre écrit n'est interprété. */
  const corpsRendu = (m: Message) => {
    const morceaux = m.body.split(/(\s+)/);
    return morceaux.map((mot, i) => {
      if (/^[@#]/.test(mot)) {
        return (
          <span key={i} style={{
            color: 'var(--adj-brand)', fontWeight: 'var(--adj-w-semi)' as never,
          }}>
            {mot}
          </span>
        );
      }
      return <span key={i}>{mot}</span>;
    });
  };

  const heure = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale, {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <section style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0,
      background: 'var(--adj-panel)',
      border: '1px solid var(--adj-hairline)',
      borderRadius: 'var(--adj-round-l)',
      overflow: 'hidden',
    }}>
      <header style={{
        flexShrink: 0, padding: 'var(--adj-4) var(--adj-pad)',
        borderBottom: '1px solid var(--adj-hairline)',
      }}>
        <h2 style={{
          margin: 0, fontSize: 'var(--adj-t-md)',
          fontWeight: 'var(--adj-w-semi)' as never, color: 'var(--adj-ink)',
          letterSpacing: '-0.015em',
        }}>
          {tache ? t('tasks.chat.threadTitle') : t('tasks.chat.teamTitle')}
        </h2>
        <span style={{
          display: 'block', marginTop: 3,
          fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)',
        }}>
          {tache ? tache.titre : t('tasks.chat.teamSubtitle')}
        </span>
      </header>

      <div className="adj-scroll" style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: 'var(--adj-4) var(--adj-pad)',
        display: 'flex', flexDirection: 'column', gap: 'var(--adj-4)',
      }}>
        {chargement && (
          <p style={{ margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
            {t('dashboard.home.loading')}
          </p>
        )}

        {!chargement && messages.length === 0 && (
          <p style={{ margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)', lineHeight: 1.6 }}>
            {t('tasks.chat.empty')}
          </p>
        )}

        {messages.map(m => {
          const demoi = m.author_id === moi?.id;
          return (
            <article key={m.id} className="adj-row" style={{ display: 'flex', gap: 'var(--adj-3)', minWidth: 0 }}>
              <span aria-hidden style={{
                flexShrink: 0, width: 34, height: 34, borderRadius: 'var(--adj-round-m)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: demoi ? 'var(--adj-brand)' : 'var(--adj-panel-2)',
                color: demoi ? '#fff' : 'var(--adj-ink-2)',
                fontSize: 'var(--adj-t-xs)', fontWeight: 'var(--adj-w-bold)' as never,
              }}>
                {(m.author_nom || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--adj-2)' }}>
                  <span style={{
                    fontSize: 'var(--adj-t-sm)', fontWeight: 'var(--adj-w-semi)' as never,
                    color: 'var(--adj-ink)',
                  }}>
                    {m.author_nom || t('dashboard.home.task.unassigned')}
                  </span>
                  <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-4)' }}>
                    {heure(m.created_at)}
                  </span>
                  <span style={{ flex: 1 }} />
                  {demoi && (
                    <button
                      type="button"
                      className="adj-row-actions adj-focusable"
                      onClick={() => supprimer(m.id)}
                      aria-label={t('tasks.chat.delete')}
                      title={t('tasks.chat.delete')}
                      style={{
                        display: 'flex', padding: 4, border: 'none', background: 'transparent',
                        borderRadius: 'var(--adj-round-s)', color: 'var(--adj-ink-4)', cursor: 'pointer',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--adj-neg)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--adj-ink-4)'; }}
                    >
                      <Trash2 size={14} strokeWidth={1.9} />
                    </button>
                  )}
                </span>

                <p style={{
                  margin: '3px 0 0', fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)',
                  lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {corpsRendu(m)}
                </p>

                {m.refs.length > 0 && (
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                    {m.refs.map((r, i) => (
                      <span key={`${r.id}-${i}`} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 8px', borderRadius: 'var(--adj-round-s)',
                        background: 'var(--adj-panel-2)', color: 'var(--adj-ink-2)',
                        fontSize: 'var(--adj-t-xs)',
                      }}>
                        <Paperclip size={12} strokeWidth={1.9} />
                        {r.label}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </article>
          );
        })}
        <div ref={bas} />
      </div>

      {erreur && (
        <p role="alert" style={{
          margin: 0, padding: '8px var(--adj-pad)', flexShrink: 0,
          fontSize: 'var(--adj-t-xs)', color: 'var(--adj-neg)', background: 'var(--adj-neg-tint)',
        }}>
          {erreur}
        </p>
      )}

      {/* --- Composeur --- */}
      <div style={{
        position: 'relative', flexShrink: 0,
        padding: 'var(--adj-3) var(--adj-pad) var(--adj-4)',
        borderTop: '1px solid var(--adj-hairline)',
      }}>
        {jeton && suggestions.length > 0 && (
          <div className="adj-pop" style={{
            position: 'absolute', bottom: 'calc(100% - 4px)', left: 'var(--adj-pad)', right: 'var(--adj-pad)',
            background: 'var(--adj-panel)', border: '1px solid var(--adj-hairline)',
            borderRadius: 'var(--adj-round-m)', boxShadow: 'var(--adj-lift-3)',
            padding: 4, zIndex: 20, maxHeight: 240, overflowY: 'auto',
          }}>
            {suggestions.map((s, i) => (
              <div
                key={s.cle}
                onMouseDown={e => { e.preventDefault(); choisir(s); }}
                onMouseEnter={() => setSurvol(i)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 1,
                  padding: '8px 10px', borderRadius: 'var(--adj-round-s)', cursor: 'pointer',
                  background: i === survol ? 'var(--adj-brand-tint)' : 'transparent',
                }}
              >
                <span style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink)' }}>{s.libelle}</span>
                {s.detail && (
                  <span style={{
                    fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-4)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {s.detail}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 'var(--adj-2)',
          padding: 'var(--adj-2)',
          border: '1px solid var(--adj-edge)', borderRadius: 'var(--adj-round-m)',
          background: 'var(--adj-panel)',
        }}>
          <textarea
            ref={zone}
            value={texte}
            rows={1}
            onChange={e => {
              setTexte(e.target.value);
              relireJeton(e.target.value, e.target.selectionStart ?? 0);
              // La zone grandit avec le texte, jusqu'à cinq lignes environ.
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={touche}
            placeholder={t('tasks.chat.placeholder')}
            aria-label={t('tasks.chat.placeholder')}
            style={{
              flex: 1, minWidth: 0, resize: 'none', border: 'none', outline: 'none',
              background: 'transparent', color: 'var(--adj-ink)',
              fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)', lineHeight: 1.5,
              padding: '7px 6px', maxHeight: 120,
            }}
          />
          <button
            type="button"
            onClick={envoyer}
            disabled={!texte.trim() || envoi}
            aria-label={t('tasks.chat.send')}
            title={t('tasks.chat.send')}
            className="adj-focusable adj-anim"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              width: 34, height: 34, borderRadius: 'var(--adj-round-s)', border: 'none',
              background: texte.trim() ? 'var(--adj-brand)' : 'var(--adj-panel-2)',
              color: texte.trim() ? '#fff' : 'var(--adj-ink-4)',
              cursor: texte.trim() && !envoi ? 'pointer' : 'not-allowed',
            }}
          >
            <SendHorizonal size={16} strokeWidth={2} />
          </button>
        </div>

        <span style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 7,
          fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-4)',
        }}>
          <AtSign size={12} strokeWidth={1.9} />
          {t('tasks.chat.hint')}
        </span>
      </div>
    </section>
  );
}
