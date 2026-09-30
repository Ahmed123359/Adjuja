import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EligibilityVerdict, EligibilityVerdictType, ScrapedAo } from '../../../types';
import type { DownloadProgress } from '../types';
import WatcherStatusBadge from './WatcherStatusBadge';
import DownloadProgressBanner from './DownloadProgressBanner';
import { updateScrapedAoStatus, importScrapedAo, analyzeScrapedAo, fetchScrapedAo, downloadScrapedAoZip } from '../../../api';
import { fetchScrapedAoDocument } from '../api';
import { useApercuDocument } from '../../../shared/ui/DocumentPreviewModal';
import { FitScore } from '../../ao/components/FitScore';
import { FicheAnalyse, SECTIONS_VEILLE } from '../../ao/components/analyse/FicheAnalyse';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { formatTitre, splitReservationClause } from '../../../utils/formatTitre';

const TITRE_CLAMP_LINES = 4;

type Tab = 'resume' | 'docs' | 'goNoGo';

const VERDICT_STYLES: Record<EligibilityVerdictType, { bg: string; color: string; border: string }> = {
  go: {
    bg:     'var(--adj-pos-tint)',
    color:  'var(--adj-pos)',
    border: 'color-mix(in srgb, var(--adj-pos) 25%, transparent)',
  },
  risque: {
    bg:     'var(--adj-hold-tint)',
    color:  'var(--adj-hold)',
    border: 'color-mix(in srgb, var(--adj-hold) 25%, transparent)',
  },
  no_go: {
    bg:     'var(--adj-neg-tint)',
    color:  'var(--adj-neg)',
    border: 'color-mix(in srgb, var(--adj-neg) 25%, transparent)',
  },
};

type Props = {
  ao: ScrapedAo;
  onClose: () => void;
  onUpdated: (ao: ScrapedAo) => void;
};

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 'var(--adj-t-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--adj-ink-4)' }}>
        {label}
      </span>
      <span style={{ fontSize: 'var(--adj-t-sm)', fontWeight: 600, color: 'var(--adj-ink)', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.4 }}>
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
    padding:        '0 14px',
    height:         38,
    flex:           '1 1 auto',
    borderRadius:   'var(--adj-round-m)',
    fontSize:       'var(--adj-t-sm)',
    fontWeight:     600,
    whiteSpace:     'nowrap',
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

function Spinner() {
  return (
    <div style={{
      width: 14, height: 14, borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.3)',
      borderTopColor: '#fff',
      animation: 'spin 1s linear infinite',
      flexShrink: 0,
    }} />
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

function formatAmount(raw: string | null): string {
  if (!raw) return '-';
  const n = parseFloat(raw);
  if (isNaN(n)) return raw;
  return n.toLocaleString('fr-MA', { maximumFractionDigits: 0 }) + ' Dhs';
}

export default function AoDetailPanel({ ao: initialAo, onClose, onUpdated }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [ao, setAo] = useState<ScrapedAo>(initialAo);
  const [tab, setTab] = useState<Tab>('resume');
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [importedId, setImportedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [verdict, setVerdict] = useState<EligibilityVerdict | null>(null);
  // Apercu des documents de l'onglet Documents (2026-09-27).
  const { ouvrirFichier, modale: apercuModale } = useApercuDocument();
  const [apercuEnCours, setApercuEnCours] = useState<string | null>(null);
  const [apercuErreur, setApercuErreur] = useState<string | null>(null);
  async function ouvrirDocument(label: string, nom: string) {
    setApercuErreur(null);
    setApercuEnCours(label);
    try {
      const blob = await fetchScrapedAoDocument(ao.id, label);
      ouvrirFichier(new File([blob], nom, { type: blob.type || 'application/pdf' }));
    } catch (e) {
      setApercuErreur(e instanceof Error ? e.message : t('veille.detail.previewError'));
    } finally {
      setApercuEnCours(null);
    }
  }
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [titreExpanded, setTitreExpanded] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const update = async (status: string) => {
    setLoadingStatus(true);
    setError(null);
    try {
      const updated = await updateScrapedAoStatus(ao.id, status);
      setAo(updated);
      onUpdated(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoadingStatus(false);
    }
  };

  const doImport = async () => {
    setLoadingImport(true);
    setError(null);
    try {
      const result = await importScrapedAo(ao.id);
      setImportedId(result.ao_id);
      const updated = { ...ao, status: 'imported' as const };
      setAo(updated);
      onUpdated(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur import');
    } finally {
      setLoadingImport(false);
    }
  };

  const doDownloadZip = async () => {
    setDownloadingZip(true);
    setDownloadError(null);
    try {
      await downloadScrapedAoZip(ao.id);
    } catch (e: unknown) {
      setDownloadError(e instanceof Error ? e.message : 'Erreur téléchargement');
    } finally {
      setDownloadingZip(false);
    }
  };

  // Documents scannes : la route repond 202 tant que l'OCR tourne (plusieurs
  // secondes par page) ; on la rappelle jusqu'au verdict. Arret si le panneau
  // se ferme.
  const [ocrProgress, setOcrProgress] = useState<DownloadProgress | null>(null);
  const ferme = useRef(false);
  useEffect(() => () => { ferme.current = true; }, []);

  const doAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      for (;;) {
        const result = await analyzeScrapedAo(ao.id);
        if (ferme.current) return;
        if ('ocr' in result) {
          setOcrProgress(result.ocr);
          await new Promise(r => setTimeout(r, 3000));
          if (ferme.current) return;
          continue;
        }
        setOcrProgress(null);
        setVerdict(result);
        setAo(prev => ({ ...prev, analyse_json: result.analyse_json }));
        break;
      }
    } catch (e: unknown) {
      if (!ferme.current) setAnalyzeError(e instanceof Error ? e.message : t('veille.detail.goNoGo.error'));
    } finally {
      if (!ferme.current) {
        setAnalyzing(false);
        setOcrProgress(null);
      }
    }
  };

  const noZipLink      = ao.status === 'favorited' && !ao.zip_url && !ao.zip_downloaded_at && !ao.zip_error;
  const isDownloading  = ao.status === 'favorited' && !!ao.zip_url && !ao.zip_downloaded_at && !ao.zip_error;
  const hasZipError    = ao.status === 'favorited' && !!ao.zip_error;
  // Étape réelle côté serveur. Présente aussi quand aucun lien n'est encore connu :
  // le serveur revérifie alors la page du portail avant de conclure.
  const progress       = ao.download_progress ?? null;

  /** Le passage en "favorited" déclenche un téléchargement asynchrone côté ao-watcher
   * (Celery) -- mais seulement si zip_url a été capté au scraping (~31% des AOs
   * marchespublics n'en ont pas, voir noZipLink ci-dessus). update() ci-dessus ne
   * renvoie que l'état au moment du clic -- sans ce polling, le panneau restait bloqué
   * sur "Téléchargement en cours..." indéfiniment même une fois le fichier prêt côté
   * backend, tant que l'utilisateur ne fermait pas et rouvrait pas le panneau
   * manuellement.
   *
   * noZipLink est aussi surveillé : le scraper n'enrichit une AO qu'une seule fois à
   * sa découverte, donc zip_url peut être NULL simplement parce que l'acheteur a mis
   * en ligne le DCE après notre passage -- le backend revérifie en direct
   * (refresh_and_download_ao_zip) quand on favorise sans zip_url connu. Dans ce cas,
   * on suit seulement le temps de cette revérification (tant que le serveur renvoie
   * une étape), puis on s'arrête.
   *
   * Pendant un vrai téléchargement, AUCUNE limite : l'ancienne borne de 15 tentatives
   * (~45 s) s'appliquait aussi ici, alors qu'un cycle de relances dure plusieurs
   * minutes, et le panneau restait figé sur « en cours » avec des documents prêts
   * (bugs-connus.md, 2026-09-14). On espace seulement les appels après 2 minutes. */
  useEffect(() => {
    if (!isDownloading && !noZipLink) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      attempts += 1;
      try {
        const refreshed = await fetchScrapedAo(ao.id);
        if (cancelled) return;
        setAo(refreshed);
        onUpdated(refreshed);
        if (!isDownloading && !refreshed.download_progress && attempts >= 2) return;
      } catch {
        // Erreur réseau ponctuelle : on retente au prochain tick, pas la peine d'afficher une erreur.
      }
      if (!cancelled) timer = setTimeout(tick, attempts > 40 ? 10000 : 3000);
    };
    timer = setTimeout(tick, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isDownloading, noZipLink, ao.id]);
  useEffect(() => {
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, [onClose]);

  const zipReady      = ao.status === 'favorited' && !!ao.zip_downloaded_at && !!ao.classified_docs;
  const canImport     = zipReady && ao.status === 'favorited';

  return (
    <>
      {/* Voile : il assombrit la liste, dit que le panneau est au premier plan,
          et le referme d'un clic a cote. */}
      {!isMobile && (
        <div
          className="adj-overlay"
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 55,
            background: 'rgba(16, 21, 41, 0.42)',
          }}
        />
      )}

    <aside
      className={isMobile ? undefined : 'adj-drawer'}
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
              // En SUPERPOSITION, pas en colonne voisine : en prenant 460px a
              // la liste, le panneau faisait deborder le tableau et ses
              // dernieres colonnes passaient dessous, donc invisibles.
              position:      'fixed',
              top:           0,
              right:         0,
              bottom:        0,
              zIndex:        60,
              width:         'min(520px, 92vw)',
              display:       'flex',
              flexDirection: 'column',
              background:    'var(--adj-panel)',
              borderLeft:    '1px solid var(--adj-hairline)',
              boxShadow:     'var(--adj-lift-3)',
              overflowY:     'auto',
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
          <WatcherStatusBadge status={ao.status} size="md" />
          <span
            title={ao.reference ? t('veille.detail.reference', { ref: ao.reference }) : (ao.external_id || ao.source)}
            style={{
              fontSize:       'var(--adj-t-xs)',
              color:          'var(--adj-ink-4)',
              fontWeight:     500,
              whiteSpace:     'nowrap',
              overflow:       'hidden',
              textOverflow:   'ellipsis',
            }}
          >
            {ao.reference ? t('veille.detail.reference', { ref: ao.reference }) : (ao.external_id || ao.source)}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background:   'none',
            border:       'none',
            cursor:       'pointer',
            color:        'var(--adj-ink-4)',
            display:      'flex',
            padding:      4,
            borderRadius: 6,
            flexShrink:   0,
            transition:   'color .15s',
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
          {ao.acheteur && (
            <p style={{ margin: '0 0 5px', fontSize: 'var(--adj-t-xs)', fontWeight: 600, color: 'var(--adj-ink-2)' }}>
              {ao.acheteur}
            </p>
          )}
          {(() => {
            const { main, clause } = splitReservationClause(ao.titre);
            const displayTitre = formatTitre(main);
            const isLong = displayTitre.length > 220;
            return (
              <>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'var(--adj-ink)',
                    lineHeight: 1.4,
                    ...(isLong && !titreExpanded
                      ? {
                          display: '-webkit-box',
                          WebkitLineClamp: TITRE_CLAMP_LINES,
                          WebkitBoxOrient: 'vertical' as const,
                          overflow: 'hidden',
                        }
                      : {}),
                  }}
                >
                  {displayTitre}
                </h2>
                {isLong && (
                  <button
                    onClick={() => setTitreExpanded(v => !v)}
                    style={{
                      marginTop: 4,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontSize: 'var(--adj-t-xs)',
                      fontWeight: 600,
                      color: 'var(--adj-brand)',
                      fontFamily: 'inherit',
                    }}
                  >
                    {titreExpanded ? t('veille.detail.showLess') : t('veille.detail.showMore')}
                  </button>
                )}
                {clause && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '7px 11px',
                      borderRadius: 8,
                      background: 'var(--adj-brand-tint)',
                      border: '1px solid var(--adj-brand-edge)',
                      fontSize: 'var(--adj-t-xs)',
                      color: 'var(--adj-brand)',
                      lineHeight: 1.5,
                    }}
                  >
                    {formatTitre(clause)}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Budget + Caution chips */}
        {(ao.budget_estime || ao.caution) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {ao.budget_estime && (
              <span style={{
                fontSize: 'var(--adj-t-xs)', fontWeight: 600, padding: '4px 10px',
                borderRadius: 20, background: 'var(--adj-brand-tint)',
                color: 'var(--adj-brand)', border: '1px solid var(--adj-brand-edge)',
              }}>
                {t('veille.detail.budget')}: {formatAmount(ao.budget_estime)}
              </span>
            )}
            {ao.caution && (
              <span style={{
                fontSize: 'var(--adj-t-xs)', fontWeight: 600, padding: '4px 10px',
                borderRadius: 20, background: 'var(--adj-panel-2)',
                color: 'var(--adj-ink-2)', border: '1px solid var(--adj-hairline)',
              }}>
                {t('veille.detail.caution')}: {formatAmount(ao.caution)}
              </span>
            )}
          </div>
        )}

        {/* Meta grid */}
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: '1fr 1fr',
            gap:                 14,
            padding:             '14px 16px',
            background:          'var(--adj-panel-2)',
            borderRadius:        10,
            border:              '1px solid var(--adj-hairline)',
            marginBottom:        18,
          }}
        >
          <MetaChip label={t('veille.detail.datePub')}    value={formatDate(ao.date_publication)} />
          <MetaChip label={t('veille.detail.dateLimite')} value={formatDate(ao.date_limite)} />
          {(ao.region || ao.ville) && (
            <MetaChip
              label={t('veille.detail.location')}
              value={ao.region || ao.ville || ''}
            />
          )}
          {ao.categorie && (
            <MetaChip label={t('veille.detail.categorie')} value={ao.categorie} />
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--adj-2)', marginBottom: 'var(--adj-5)' }}>

          {/* Mark seen */}
          {ao.status === 'new' && (
            <ActionBtn variant="ghost" onClick={() => update('seen')} disabled={loadingStatus}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {loadingStatus ? '...' : t('veille.detail.markSeen')}
            </ActionBtn>
          )}

          {/* Add to favorites */}
          {(ao.status === 'new' || ao.status === 'seen') && (
            <ActionBtn variant="primary" onClick={() => update('favorited')} disabled={loadingStatus}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
              {loadingStatus ? '...' : t('veille.detail.addFavorite')}
            </ActionBtn>
          )}

          {/* Favorited state */}
          {ao.status === 'favorited' && (
            <>
              {(isDownloading || (noZipLink && progress)) && (
                <DownloadProgressBanner progress={progress} fallback={t('veille.detail.downloadingZip')} />
              )}

              {hasZipError && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--adj-neg-tint)',
                  border: '1px solid color-mix(in srgb, var(--adj-neg) 25%, transparent)',
                }}>
                  <p style={{ margin: '0 0 4px', fontSize: 'var(--adj-t-xs)', fontWeight: 700, color: 'var(--adj-neg)' }}>
                    {t('veille.detail.zipError')}
                  </p>
                  <p style={{ margin: 0, fontSize: 'var(--adj-t-xs)', color: 'var(--adj-neg)' }}>{ao.zip_error}</p>
                </div>
              )}

              {noZipLink && !progress && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--adj-panel-2)',
                  border: '1px solid var(--adj-hairline)',
                }}>
                  <p style={{ margin: 0, fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-2)' }}>
                    {t('veille.detail.noZipLink')}
                  </p>
                </div>
              )}

              {zipReady && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 14px', borderRadius: 8,
                  background: 'var(--adj-pos-tint)',
                  border: '1px solid color-mix(in srgb, var(--adj-pos) 25%, transparent)',
                }}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--adj-pos)" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span style={{ fontSize: 'var(--adj-t-sm)', fontWeight: 600, color: 'var(--adj-pos)' }}>
                    {t('veille.detail.zipReady')} ({Object.keys(ao.classified_docs!).length} docs)
                  </span>
                </div>
              )}

              {zipReady && (
                <ActionBtn variant="secondary" onClick={doDownloadZip} disabled={downloadingZip}>
                  {downloadingZip ? <Spinner /> : (
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 3v13.5m0 0L7.5 12m4.5 4.5L16.5 12" />
                    </svg>
                  )}
                  {downloadingZip ? t('veille.detail.downloadingZipBtn') : t('veille.detail.downloadZipBtn')}
                </ActionBtn>
              )}

              {downloadError && (
                <p style={{ margin: 0, fontSize: 'var(--adj-t-xs)', color: 'var(--adj-neg)' }}>{downloadError}</p>
              )}

              {canImport && (
                <ActionBtn variant="primary" onClick={doImport} disabled={loadingImport}>
                  {loadingImport ? <Spinner /> : (
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                  )}
                  {loadingImport ? t('veille.detail.importing') : t('veille.detail.importBtn')}
                </ActionBtn>
              )}
            </>
          )}

          {/* Imported */}
          {ao.status === 'imported' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 14px', borderRadius: 8,
              background: 'var(--adj-pos-tint)',
              border: '1px solid color-mix(in srgb, var(--adj-pos) 25%, transparent)',
            }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--adj-pos)" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span style={{ fontSize: 'var(--adj-t-sm)', fontWeight: 600, color: 'var(--adj-pos)' }}>
                {importedId
                  ? `${t('veille.detail.importDone')} (#${importedId})`
                  : t('veille.detail.importDone')}
              </span>
            </div>
          )}

          {/* Open on portal */}
          <a
            href={ao.url_source}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:        'flex',
              alignItems:     'center',
              gap:            6,
              padding:        '8px 14px',
              borderRadius:   8,
              fontSize:       'var(--adj-t-sm)',
              fontWeight:     500,
              color:          'var(--adj-ink-2)',
              border:         '1px solid var(--adj-hairline)',
              textDecoration: 'none',
              transition:     'color .15s',
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

        {/* Error */}
        {error && (
          <p style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-neg)', marginBottom: 16 }}>{error}</p>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--adj-hairline)', marginBottom: 16 }}>
          {(['resume', 'docs', 'goNoGo'] as Tab[]).map(t2 => (
            <button
              key={t2}
              onClick={() => setTab(t2)}
              style={{
                padding:      '8px 16px',
                background:   'none',
                border:       'none',
                borderBottom: tab === t2 ? '2px solid var(--adj-brand)' : '2px solid transparent',
                color:        tab === t2 ? 'var(--adj-brand)' : 'var(--adj-ink-2)',
                fontSize:     'var(--adj-t-sm)',
                fontWeight:   tab === t2 ? 700 : 500,
                cursor:       'pointer',
                fontFamily:   'inherit',
                transition:   'color .15s',
                marginBottom: -1,
              }}
            >
              {t(`veille.detail.tab${t2.charAt(0).toUpperCase() + t2.slice(1)}`)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'resume' && (
          <p style={{ margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)', lineHeight: 1.7 }}>
            {ao.description ?? t('veille.detail.noDesc')}
          </p>
        )}

        {tab === 'docs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ao.classified_docs && Object.keys(ao.classified_docs).length > 0
              ? Object.entries(ao.classified_docs).map(([label, key]) => (
                  <div
                    key={label}
                    style={{
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'space-between',
                      padding:        '10px 12px',
                      borderRadius:   8,
                      border:         '1px solid var(--adj-hairline)',
                      background:     'var(--adj-panel-2)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--adj-ink-4)" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span style={{ fontSize: 'var(--adj-t-sm)', fontWeight: 600, color: 'var(--adj-ink)', textTransform: 'capitalize' }}>
                        {label.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-4)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {key.split('/').pop()}
                      </span>
                      {/\.pdf$/i.test(key) && (
                        <button
                          type="button"
                          className="adj-focusable"
                          onClick={() => ouvrirDocument(label, key.split('/').pop() || `${label}.pdf`)}
                          disabled={apercuEnCours !== null}
                          style={{
                            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
                            height: 32, padding: '0 10px', borderRadius: 'var(--adj-round-s)',
                            border: '1px solid var(--adj-hairline)', background: 'var(--adj-panel)',
                            color: 'var(--adj-brand)', fontFamily: 'inherit',
                            fontSize: 'var(--adj-t-xs)', fontWeight: 600,
                            cursor: apercuEnCours !== null ? 'wait' : 'pointer',
                          }}
                        >
                          {apercuEnCours === label ? <Spinner /> : (
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          )}
                          {t('veille.detail.preview')}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              : (
                <p style={{ margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-4)' }}>
                  {isDownloading || progress
                    ? t('veille.detail.downloadingZip')
                    : noZipLink
                    ? t('veille.detail.noZipLink')
                    : t('veille.detail.noDesc')}
                </p>
              )}
          </div>
        )}

        {tab === 'docs' && apercuErreur && (
          <p role="alert" style={{ margin: '8px 0 0', fontSize: 'var(--adj-t-xs)', color: 'var(--adj-neg)' }}>{apercuErreur}</p>
        )}

        {tab === 'goNoGo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!zipReady ? (
              <p style={{ margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-4)' }}>
                {t('veille.detail.goNoGo.needFavorite')}
              </p>
            ) : (
              <>
                <ActionBtn variant="secondary" onClick={doAnalyze} disabled={analyzing}>
                  {analyzing ? <Spinner /> : (
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                    </svg>
                  )}
                  {analyzing ? t('veille.detail.goNoGo.analyzing') : t('veille.detail.goNoGo.cta')}
                </ActionBtn>

                {ocrProgress && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <p style={{ margin: 0, fontSize: 'var(--adj-t-sm)', fontWeight: 600, color: 'var(--adj-ink)' }}>
                      {ocrProgress.pages
                        ? t('veille.detail.goNoGo.ocrProgress', { page: ocrProgress.page ?? 0, pages: ocrProgress.pages })
                        : t('veille.detail.goNoGo.ocrQueued')}
                    </p>
                    {!!ocrProgress.pages && (
                      <div aria-hidden style={{ height: 6, borderRadius: 3, background: 'var(--adj-panel-2)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 3, background: 'var(--adj-brand)',
                          width: `${Math.round(100 * (ocrProgress.page ?? 0) / ocrProgress.pages)}%`,
                          transition: 'width .4s',
                        }} />
                      </div>
                    )}
                    <p style={{ margin: 0, fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)', lineHeight: 1.45 }}>
                      {t('veille.detail.goNoGo.ocrHint')}
                    </p>
                  </div>
                )}

                {analyzeError && (
                  <p style={{ margin: 0, fontSize: 'var(--adj-t-xs)', color: 'var(--adj-neg)' }}>{analyzeError}</p>
                )}

                {/* Fit score (2026-09-27) ; l'ancien verdict ne reste qu'en repli,
                    si l'app principale ne renvoie pas encore de score. */}
                {verdict?.fit_score && <FitScore data={verdict.fit_score} />}

                {verdict && !verdict.fit_score && (
                  <>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 14px', borderRadius: 8,
                      background: VERDICT_STYLES[verdict.verdict].bg,
                      border: `1px solid ${VERDICT_STYLES[verdict.verdict].border}`,
                    }}>
                      <span style={{ fontSize: 'var(--adj-t-sm)', fontWeight: 700, color: VERDICT_STYLES[verdict.verdict].color }}>
                        {t(`veille.detail.goNoGo.verdict.${verdict.verdict}`)}
                      </span>
                    </div>

                    {verdict.raisons.length > 0 && (
                      <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {verdict.raisons.map((raison, i) => (
                          <li key={i} style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-2)', lineHeight: 1.5 }}>
                            {raison}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                {/* Analyse enrichie : risques, jalons, questions, clauses,
                    budget (spec analyse-ao-enrichie). Apres le score : on
                    decide d'abord, on approfondit ensuite. */}
                {ao.analyse_json && (
                  <div style={{ borderTop: '1px solid var(--adj-hairline)', paddingTop: 16 }}>
                    <FicheAnalyse analyse={ao.analyse_json} sections={SECTIONS_VEILLE} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </aside>
    {apercuModale}
    </>
  );
}
