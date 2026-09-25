import { useTranslation } from 'react-i18next';
import type { DownloadProgress } from '../types';

type Props = {
  progress: DownloadProgress | null;
  /** Libellé affiché tant que le serveur n'a pas encore renvoyé d'étape. */
  fallback: string;
};

/** Étape réellement en cours d'un téléchargement de documents, et temps écoulé.
 * Remplace l'ancien « Téléchargement en cours… » figé du premier au dernier
 * instant, alors que la tâche traverse plusieurs étapes et peut attendre 60 s
 * entre deux tentatives (chantier download-dce-lenteur, 2026-09-14). */
export default function DownloadProgressBanner({ progress, fallback }: Props) {
  const { t } = useTranslation();
  const retrying = progress?.etape === 'nouvelle_tentative';

  let label = fallback;
  if (progress && retrying) {
    label = t('veille.detail.downloadRetrying', {
      tentative: progress.tentative ?? 1,
      max:       progress.max_tentatives ?? 1,
      s:         progress.retry_in_s ?? 0,
    });
  } else if (progress) {
    label = t(`veille.detail.downloadStep.${progress.etape}`, { defaultValue: fallback });
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 8,
        background: 'var(--l-warn-bg)',
        border: '1px solid var(--l-warn-border)',
      }}
    >
      <div style={{
        width: 14, height: 14, borderRadius: '50%',
        border: '2px solid var(--l-warn-border)',
        borderTopColor: 'var(--l-warn)',
        animation: 'spin 1s linear infinite',
        flexShrink: 0,
      }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--l-warn)', fontWeight: 500 }}>
        {label}
      </span>
      {progress && !retrying && (
        <span style={{ flexShrink: 0, fontSize: 12, color: 'var(--l-warn)', fontVariantNumeric: 'tabular-nums' }}>
          {t('veille.detail.downloadElapsed', { s: progress.elapsed_s })}
        </span>
      )}
    </div>
  );
}
