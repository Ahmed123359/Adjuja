import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import VeillePage from './VeillePage';
import BdcPage from './BdcPage';

type Source = 'marches' | 'bdc';

export default function VeilleHubPage() {
  const { t } = useTranslation();
  const [source, setSource] = useState<Source>('marches');

  const tabs: { key: Source; label: string }[] = [
    { key: 'marches', label: t('veille.hub.tabMarches') },
    { key: 'bdc', label: t('veille.hub.tabBdc') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sub-tabs : source de veille */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px 0',
          borderBottom: '1px solid var(--adj-hairline)', background: 'var(--adj-panel)', flexShrink: 0,
        }}
      >
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setSource(tab.key)}
            style={{
              padding: '8px 14px', background: 'none', border: 'none',
              borderBottom: source === tab.key ? '2px solid var(--adj-brand)' : '2px solid transparent',
              color: source === tab.key ? 'var(--adj-brand)' : 'var(--adj-ink-2)',
              fontSize: 'var(--adj-t-sm)', fontWeight: source === tab.key ? 700 : 500,
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1, transition: 'color .12s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {source === 'marches' ? <VeillePage /> : <BdcPage />}
      </div>
    </div>
  );
}
