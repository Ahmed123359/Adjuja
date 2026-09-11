import { useTranslation } from 'react-i18next';
import type { ScrapedAoStatus } from '../../../types';

const STYLES: Record<ScrapedAoStatus, { bg: string; color: string; border: string }> = {
  new: {
    bg:     'rgba(30,136,229,0.10)',
    color:  '#1E88E5',
    border: 'rgba(30,136,229,0.25)',
  },
  seen: {
    bg:     'var(--l-input-bg)',
    color:  'var(--l-sub)',
    border: 'var(--l-card-border)',
  },
  favorited: {
    bg:     'rgba(245,158,11,0.10)',
    color:  '#d97706',
    border: 'rgba(245,158,11,0.25)',
  },
  imported: {
    bg:     'rgba(34,197,94,0.10)',
    color:  '#16a34a',
    border: 'rgba(34,197,94,0.25)',
  },
};

type Props = {
  status: ScrapedAoStatus;
  size?: 'sm' | 'md';
};

export default function WatcherStatusBadge({ status, size = 'sm' }: Props) {
  const { t } = useTranslation();
  const s = STYLES[status];
  return (
    <span
      style={{
        fontSize:      size === 'sm' ? 11 : 12,
        fontWeight:    600,
        padding:       size === 'sm' ? '2px 8px' : '4px 11px',
        borderRadius:  20,
        background:    s.bg,
        color:         s.color,
        border:        `1px solid ${s.border}`,
        whiteSpace:    'nowrap',
        letterSpacing: '0.01em',
      }}
    >
      {t(`veille.status.${status}`)}
    </span>
  );
}
