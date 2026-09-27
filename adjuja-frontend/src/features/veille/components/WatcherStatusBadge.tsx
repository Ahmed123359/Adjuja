import { useTranslation } from 'react-i18next';
import type { ScrapedAoStatus } from '../../../types';

const STYLES: Record<ScrapedAoStatus, { bg: string; color: string; border: string }> = {
  new: {
    bg:     'var(--adj-brand-tint)',
    color:  'var(--adj-brand)',
    border: 'var(--adj-brand-edge)',
  },
  seen: {
    bg:     'var(--adj-panel-2)',
    color:  'var(--adj-ink-2)',
    border: 'var(--adj-hairline)',
  },
  favorited: {
    bg:     'var(--adj-hold-tint)',
    color:  'var(--adj-hold)',
    border: 'var(--adj-hold)',
  },
  imported: {
    bg:     'var(--adj-pos-tint)',
    color:  'var(--adj-pos)',
    border: 'var(--adj-pos)',
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
        display:       'inline-block',
        flexShrink:    0,
        fontSize:      size === 'sm' ? 'var(--adj-t-xs)' : 'var(--adj-t-sm)',
        fontWeight:    600,
        padding:       size === 'sm' ? '2px 8px' : '4px 11px',
        borderRadius:  'var(--adj-round-s)',
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
