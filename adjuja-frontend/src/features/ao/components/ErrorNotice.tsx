// Message d'erreur du pipeline -- 2026-09-25.
//
// L'ecran affichait la sortie brute du service :
//
//     SDKError: API error occurred: Status 401 {"detail":"Invalid API Key"}
//
// Personne ne peut agir sur cette phrase. Elle nomme une bibliotheque, un code
// HTTP et une structure JSON, et ne dit ni ce qui a echoue, ni quoi faire.
//
// Ici, le message est traduit en une phrase utile quand on reconnait la cause,
// et le texte d'origine reste disponible sous un repli -- il est indispensable
// pour le support, il n'a simplement rien a faire au premier plan.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronDown } from 'lucide-react';

/** Reconnait les causes frequentes a partir du texte brut du service.
 *
 *  Volontairement conservateur : une cause non reconnue renvoie `null` et le
 *  message d'origine est alors affiche tel quel. Deviner une explication fausse
 *  serait pire que de montrer une phrase technique. */
function cause(brut: string): string | null {
  const t = brut.toLowerCase();
  if (t.includes('401') || t.includes('invalid api key') || t.includes('unauthorized')) return 'apiKey';
  if (t.includes('429') || t.includes('rate limit') || t.includes('quota')) return 'quota';
  if (t.includes('timeout') || t.includes('timed out')) return 'timeout';
  if (t.includes('connection') || t.includes('econnrefused') || t.includes('unreachable')) return 'reseau';
  return null;
}

export function ErrorNotice({ message }: { message: string }) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = useState(false);

  const cle = cause(message);
  const titre = cle ? t(`pipeline.errors.${cle}.title`) : t('pipeline.errors.generic.title');
  const detail = cle ? t(`pipeline.errors.${cle}.body`) : null;

  return (
    <div role="alert" style={{
      padding: 'var(--adj-4)',
      borderRadius: 'var(--adj-round-m)',
      background: 'var(--adj-neg-tint)',
      border: '1px solid var(--adj-neg)',
    }}>
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <AlertTriangle size={18} strokeWidth={2} color="var(--adj-neg)" style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'block', fontSize: 'var(--adj-t-sm)',
            fontWeight: 'var(--adj-w-semi)' as never, color: 'var(--adj-neg)',
          }}>
            {titre}
          </span>
          {detail && (
            <span style={{
              display: 'block', marginTop: 4,
              fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)', lineHeight: 1.55,
            }}>
              {detail}
            </span>
          )}

          <button
            type="button"
            onClick={() => setOuvert(o => !o)}
            aria-expanded={ouvert}
            className="adj-focusable"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8,
              padding: 0, border: 'none', background: 'transparent',
              color: 'var(--adj-ink-3)', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 'var(--adj-t-xs)',
            }}
          >
            <ChevronDown
              size={13} strokeWidth={2}
              style={{ transform: ouvert ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
            />
            {ouvert ? t('pipeline.errors.hideDetail') : t('pipeline.errors.showDetail')}
          </button>

          {ouvert && (
            <code style={{
              display: 'block', marginTop: 8, padding: '9px 11px',
              borderRadius: 'var(--adj-round-s)',
              background: 'var(--adj-panel)', border: '1px solid var(--adj-hairline)',
              color: 'var(--adj-ink-3)', fontSize: 'var(--adj-t-xs)',
              lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {message}
            </code>
          )}
        </span>
      </span>
    </div>
  );
}
