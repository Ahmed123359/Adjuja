import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Model, UsageData } from "../types";

type Section = "general" | "utilisation";

type Props = {
  provider: string;
  setProvider: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  models: Model[];
  usage: UsageData | null;
  onRefreshUsage: () => void;
  onResetUsage: () => void;
};

const PROVIDERS: { id: string; labelKey: string; descKey: string }[] = [
  { id: "anthropic", labelKey: "settings.providers.anthropic", descKey: "settings.providers.anthropicDesc" },
  { id: "openai",    labelKey: "settings.providers.openai",    descKey: "settings.providers.openaiDesc"    },
  { id: "mistral",   labelKey: "settings.providers.mistral",   descKey: "settings.providers.mistralDesc"   },
];

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--l-card)', border: '1px solid var(--l-card-border)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
      {children}
    </div>
  );
}

function CardRow({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--l-card-border)' }}>
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--l-text)' }}>{label}</p>
        {sub && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--l-sub)' }}>{sub}</p>}
      </div>
      <div style={{ flexShrink: 0, marginLeft: 16 }}>{right}</div>
    </div>
  );
}

export default function SettingsPage({ provider, setProvider, model, setModel, models, usage, onRefreshUsage, onResetUsage }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>("general");
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const filteredModels = models.filter(m => m.provider === provider);

  function handleSave() {
    setSaved(true);
    setTimeout(() => { setSaved(false); navigate(-1); }, 900);
  }

  const TABS: { id: Section; labelKey: string }[] = [
    { id: "general",     labelKey: "settings.tabs.general"     },
    { id: "utilisation", labelKey: "settings.tabs.utilisation" },
  ];

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid var(--l-card-border)', background: 'var(--l-input-bg)',
    color: 'var(--l-text)', fontSize: 13, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--l-bg-alt)', fontFamily: 'DM Sans, system-ui, sans-serif' }}>

      {/* Tab bar */}
      <div style={{ padding: '0 28px', borderBottom: '1px solid var(--l-card-border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2, background: 'var(--l-card)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSection(tab.id)}
            style={{
              position: 'relative', padding: '14px 16px', background: 'none', border: 'none',
              fontSize: 13.5, fontWeight: section === tab.id ? 600 : 500, cursor: 'pointer',
              fontFamily: 'inherit', color: section === tab.id ? 'var(--l-text)' : 'var(--l-sub)',
              transition: 'color .15s',
            }}
          >
            {t(tab.labelKey)}
            {section === tab.id && (
              <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'var(--l-blue)', borderRadius: '2px 2px 0 0' }} />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>

        {section === "general" && (
          <>
            <SectionCard>
              <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--l-card-border)' }}>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--l-text)' }}>{t('settings.provider')}</p>
              </div>
              {PROVIDERS.filter(p => models.some(m => m.provider === p.id) || models.length === 0).map((p, i, arr) => {
                const isSelected = p.id === provider;
                return (
                  <button
                    key={p.id}
                    onClick={() => setProvider(p.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '13px 18px', border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: isSelected ? 'var(--l-blue-a)' : 'var(--l-card)',
                      borderBottom: i < arr.length - 1 ? '1px solid var(--l-card-border)' : 'none',
                      fontFamily: 'inherit', transition: 'background .12s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--l-input-bg)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'var(--l-blue-a)' : 'var(--l-card)'; }}
                  >
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: isSelected ? 'var(--l-blue)' : 'var(--l-text)' }}>{t(p.labelKey)}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--l-sub)' }}>{t(p.descKey)}</p>
                    </div>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${isSelected ? 'var(--l-blue)' : 'var(--l-dim)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isSelected ? 'var(--l-blue)' : 'transparent', transition: 'all .15s',
                    }}>
                      {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                    </div>
                  </button>
                );
              })}
            </SectionCard>

            <SectionCard>
              <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--l-card-border)' }}>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--l-text)' }}>{t('settings.model')}</p>
              </div>
              <div style={{ padding: '14px 18px' }}>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  style={inputStyle}
                >
                  {filteredModels.map(m => (
                    <option key={m.model_id} value={m.model_id}>
                      {m.model_id}{m.description ? `  ${m.description}` : ""}
                    </option>
                  ))}
                </select>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--l-sub)' }}>{t('settings.modelHint')}</p>
              </div>
            </SectionCard>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleSave}
                style={{
                  padding: '10px 22px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
                  background: saved ? '#16a34a' : 'var(--l-blue)', color: '#fff',
                  fontSize: 13.5, fontWeight: 600, cursor: 'pointer', transition: 'background .2s',
                }}
              >
                {saved ? `✓ ${t('settings.saved')}` : t('settings.save')}
              </button>
              <button
                onClick={() => navigate(-1)}
                style={{
                  padding: '10px 22px', borderRadius: 9, border: '1px solid var(--l-card-border)',
                  background: 'var(--l-card)', color: 'var(--l-sub)', fontSize: 13.5,
                  fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'color .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--l-text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--l-sub)'}
              >
                {t('settings.back')}
              </button>
            </div>
          </>
        )}

        {section === "utilisation" && (
          <>
            <SectionCard>
              <CardRow
                label={t('settings.usage.tokens')}
                sub={t('settings.usage.tokensSub')}
                right={
                  <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--l-text)', fontVariantNumeric: 'tabular-nums' }}>
                    {usage ? usage.total_tokens.toLocaleString('fr-FR') : '0'}
                  </span>
                }
              />
              {usage && usage.max_tokens_cumul > 0 && (
                <div style={{ padding: '8px 18px 14px' }}>
                  <div style={{ height: 5, borderRadius: 3, background: 'var(--l-input-bg)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: 'var(--l-blue)', width: `${Math.min(100, (usage.total_tokens / usage.max_tokens_cumul) * 100)}%`, transition: 'width .4s' }} />
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--l-sub)' }}>
                    {usage.total_tokens.toLocaleString('fr-FR')} / {usage.max_tokens_cumul.toLocaleString('fr-FR')} tokens
                  </p>
                </div>
              )}
              <CardRow
                label={t('settings.usage.calls')}
                sub={t('settings.usage.callsSub')}
                right={
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--l-text)', fontVariantNumeric: 'tabular-nums' }}>
                      {usage?.total_appels ?? 0}
                    </span>
                    {usage && usage.max_appels > 0 && (
                      <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--l-sub)' }}>/ {usage.max_appels} max</p>
                    )}
                  </div>
                }
              />
              <CardRow
                label={t('settings.usage.ocr')}
                sub={t('settings.usage.ocrSub')}
                right={
                  <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: usage && usage.total_tokens_ocr > 0 ? '#d97706' : 'var(--l-dim)' }}>
                    {usage ? usage.total_tokens_ocr.toLocaleString('fr-FR') : '0'}
                  </span>
                }
              />
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--l-text)' }}>{t('settings.usage.reset')}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--l-sub)' }}>{t('settings.usage.resetSub')}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
                  {confirmReset ? (
                    <>
                      <span style={{ fontSize: 12, color: 'var(--l-sub)' }}>{t('settings.usage.confirm')}</span>
                      <button onClick={() => { onResetUsage(); setConfirmReset(false); }}
                        style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {t('settings.usage.resetBtn')}
                      </button>
                      <button onClick={() => setConfirmReset(false)}
                        style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid var(--l-card-border)', background: 'var(--l-card)', color: 'var(--l-sub)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {t('settings.usage.cancel')}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmReset(true)}
                      style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--l-sub)', cursor: 'pointer', fontFamily: 'inherit', transition: 'color .15s' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--l-sub)'}
                    >
                      {t('settings.usage.reset')}
                    </button>
                  )}
                </div>
              </div>
            </SectionCard>

            <button onClick={onRefreshUsage}
              style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--l-sub)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--l-text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--l-sub)'}
            >
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {t('settings.usage.refresh')}
            </button>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
