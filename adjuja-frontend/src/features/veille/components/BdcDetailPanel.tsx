import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScrapedBdc } from '../../../types';
import WatcherStatusBadge from './WatcherStatusBadge';
import DownloadProgressBanner from './DownloadProgressBanner';
import { updateBdcStatus, fetchScrapedBdcOne } from '../../../api';
import { useIsMobile } from '../../../hooks/useIsMobile';

type Props = {
  bdc: ScrapedBdc;
  onClose: () => void;
  onUpdated: (bdc: ScrapedBdc) => void;
};

function MetaChip({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--adj-ink-4)' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--adj-ink)', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.4 }}>
        {value}
      </span>
    </div>
  );
}

function ActionBtn({
  onClick,
  disabled,
  variant,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant: 'primary' | 'secondary' | 'ghost';
  children: React.ReactNode;
}) {
  const base: React.CSSProperties = {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
    padding:        '11px 16px',
    minHeight:      44,
    borderRadius:   10,
    fontSize:       14,
    fontWeight:     600,
    cursor:         disabled ? 'not-allowed' : 'pointer',
    border:         'none',
    fontFamily:     'inherit',
    transition:     'opacity .15s',
    opacity:        disabled ? 0.55 : 1,
    width:          '100%',
  };
  const styles: Record<string, React.CSSProperties> = {
    primary:   { ...base, background: 'var(--adj-brand)',   color: '#fff' },
    secondary: { ...base, background: 'var(--adj-panel-2)', color: 'var(--adj-ink)', border: '1px solid var(--adj-hairline)' },
    ghost:     { ...base, background: 'transparent', color: 'var(--adj-ink-2)', border: '1px solid var(--adj-hairline)' },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={styles[variant]}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = '.8'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = disabled ? '0.55' : '1'; }}
    >
      {children}
    </button>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function BdcDetailPanel({ bdc: initialBdc, onClose, onUpdated }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [bdc, setBdc] = useState<ScrapedBdc>(initialBdc);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sans document publié, aucun téléchargement n'est lancé côté serveur : ce n'est
  // pas un état « en cours ». L'ancien test l'oubliait et le panneau tournait
  // indéfiniment (bugs-connus.md, 2026-09-14).
  const hasDocument   = !!bdc.document_url;
  const isDownloading = bdc.status === 'favorited' && hasDocument && !bdc.zip_downloaded_at && !bdc.zip_error;
  const noDocument    = bdc.status === 'favorited' && !hasDocument && !bdc.zip_downloaded_at;
  const hasZipError   = bdc.status === 'favorited' && !!bdc.zip_error;
  const zipReady      = bdc.status === 'favorited' && !!bdc.zip_downloaded_at;

  /** Meme correctif que AoDetailPanel : sans ce polling, le panneau reste bloqué sur
   * "Téléchargement en cours..." indéfiniment meme apres que le fichier soit prêt côté
   * ao-watcher, tant que l'utilisateur ne ferme/rouvre pas le panneau manuellement.
   * Pas de limite pendant le téléchargement (relances à 60 s d'intervalle), appels
   * seulement espacés après 2 minutes. */
  useEffect(() => {
    if (!isDownloading) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      attempts += 1;
      try {
        const refreshed = await fetchScrapedBdcOne(bdc.id);
        if (cancelled) return;
        setBdc(refreshed);
        onUpdated(refreshed);
      } catch {
        // Erreur réseau ponctuelle : on retente au prochain tick.
      }
      if (!cancelled) timer = setTimeout(tick, attempts > 40 ? 10000 : 3000);
    };
    timer = setTimeout(tick, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isDownloading, bdc.id]);

  const update = async (status: string) => {
    setLoadingStatus(true);
    setError(null);
    try {
      const updated = await updateBdcStatus(bdc.id, status);
      setBdc(updated);
      onUpdated(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoadingStatus(false);
    }
  };

  return (
    <aside
      style={
        isMobile
          ? {
              position:      'fixed',
              inset:         0,
              zIndex:        60,
              display:       'flex',
              flexDirection: 'column',
              background:    'var(--adj-panel)',
              overflowY:     'auto',
            }
          : {
              width:          460,
              flexShrink:     0,
              display:        'flex',
              flexDirection:  'column',
              background:     'var(--adj-panel)',
              borderLeft:     '1px solid var(--adj-hairline)',
              height:         '100%',
              overflowY:      'auto',
            }
      }
    >
      {/* Header */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '14px 18px',
          borderBottom:   '1px solid var(--adj-hairline)',
          flexShrink:     0,
          gap:            12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <WatcherStatusBadge status={bdc.status} size="md" />
          <span style={{ fontSize: 11, color: 'var(--adj-ink-4)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            BDC
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--adj-ink-4)',
            display: 'flex', padding: 4, borderRadius: 6, flexShrink: 0, transition: 'color .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--adj-ink)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--adj-ink-4)')}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 16px max(24px, env(safe-area-inset-bottom))' : '18px 18px 24px' }}>

        {/* Acheteur + Titre */}
        <div style={{ marginBottom: 16 }}>
          {bdc.acheteur && (
            <p style={{ margin: '0 0 5px', fontSize: 12, fontWeight: 600, color: 'var(--adj-ink-2)' }}>
              {bdc.acheteur}
            </p>
          )}
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--adj-ink)', lineHeight: 1.4 }}>
            {bdc.titre}
          </h2>
        </div>

        {/* Bandeau annulation */}
        {bdc.est_annule && (
          <div
            style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 8,
              background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)',
            }}
          >
            <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: '#dc2626' }}>
              {t('bdc.detail.annule')} {bdc.date_annulation && `· ${formatDate(bdc.date_annulation)}`}
            </p>
            {bdc.raison_annulation && (
              <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>{bdc.raison_annulation}</p>
            )}
          </div>
        )}

        {/* Meta grid */}
        <div
          style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
            padding: '14px 16px', background: 'var(--adj-panel-2)', borderRadius: 10,
            border: '1px solid var(--adj-hairline)', marginBottom: 18,
          }}
        >
          <MetaChip label={t('veille.detail.datePub')} value={formatDate(bdc.date_publication)} />
          <MetaChip label={t('veille.detail.dateLimite')} value={formatDate(bdc.date_limite)} />
          {(bdc.region || bdc.ville) && (
            <MetaChip label={t('veille.detail.location')} value={bdc.region || bdc.ville} />
          )}
          {bdc.categorie && <MetaChip label={t('veille.detail.categorie')} value={bdc.categorie} />}
          {bdc.nature_prestation && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--adj-ink-4)' }}>
                {t('bdc.detail.naturePrestation')}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--adj-ink)', wordBreak: 'break-word' }}>{bdc.nature_prestation}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {bdc.status === 'new' && (
            <ActionBtn variant="ghost" onClick={() => update('seen')} disabled={loadingStatus}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {loadingStatus ? '...' : t('veille.detail.markSeen')}
            </ActionBtn>
          )}

          {(bdc.status === 'new' || bdc.status === 'seen') && (
            <ActionBtn variant="primary" onClick={() => update('favorited')} disabled={loadingStatus}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
              {loadingStatus ? '...' : t('veille.detail.addFavorite')}
            </ActionBtn>
          )}

          {bdc.status === 'favorited' && (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 14px', borderRadius: 8,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
              }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#d97706" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#d97706' }}>{t('veille.detail.favorited')}</span>
              </div>

              {isDownloading && (
                <DownloadProgressBanner progress={bdc.download_progress ?? null} fallback={t('bdc.detail.downloadingDoc')} />
              )}

              {noDocument && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--adj-panel-2)',
                  border: '1px solid var(--adj-hairline)',
                }}>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--adj-ink-2)' }}>
                    {t('bdc.detail.noDoc')}
                  </p>
                </div>
              )}

              {hasZipError && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(220,38,38,0.07)',
                  border: '1px solid rgba(220,38,38,0.2)',
                }}>
                  <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: '#dc2626' }}>
                    {t('bdc.detail.docError')}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>{bdc.zip_error}</p>
                </div>
              )}

              {zipReady && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 14px', borderRadius: 8,
                  background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.2)',
                }}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#16a34a" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#16a34a' }}>
                    {t('bdc.detail.docReady')}
                  </span>
                </div>
              )}
            </>
          )}

          {bdc.document_url && (
            <a
              href={bdc.document_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                color: 'var(--adj-brand)', border: '1px solid var(--adj-hairline)', textDecoration: 'none',
              }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {t('bdc.detail.downloadDoc')}
            </a>
          )}

          <a
            href={bdc.url_source}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              color: 'var(--adj-ink-2)', border: '1px solid var(--adj-hairline)', textDecoration: 'none',
              transition: 'color .15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--adj-ink)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--adj-ink-2)')}
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            {t('veille.detail.openSource')}
          </a>
        </div>

        {error && (
          <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 16 }}>{error}</p>
        )}
      </div>
    </aside>
  );
}
