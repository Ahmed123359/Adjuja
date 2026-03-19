import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Model, UsageData } from '../types';

const inputCls = "w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all";

const PROVIDER_META: Record<string, { name: string; selectedColor: string; icon: (cls: string) => React.ReactNode }> = {
  openai: {
    name: 'GPT-4',
    selectedColor: 'text-emerald-600',
    icon: cls => (
      <svg className={`h-5 w-5 ${cls}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>
        <path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
      </svg>
    ),
  },
  anthropic: {
    name: 'Claude',
    selectedColor: 'text-amber-600',
    icon: cls => (
      <svg className={`h-5 w-5 ${cls}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
      </svg>
    ),
  },
  mistral: {
    name: 'Mistral',
    selectedColor: 'text-sky-600',
    icon: cls => (
      <svg className={`h-5 w-5 ${cls}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/>
        <path d="M9.6 4.6A2 2 0 1 1 11 8H2"/>
        <path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>
      </svg>
    ),
  },
};

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

export default function SettingsPage({ provider, setProvider, model, setModel, models, usage, onRefreshUsage, onResetUsage }: Props) {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const providers      = [...new Set(models.map(m => m.provider))];
  const filteredModels = models.filter(m => m.provider === provider);

  function handleSave() {
    setSaved(true);
    setTimeout(() => { setSaved(false); navigate(-1); }, 800);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        {/* Hero */}
        <div className="space-y-2 animate-fade-in">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Réglages</h1>
          <p className="text-base text-muted-foreground">Configurez le modèle IA utilisé pour la génération.</p>
        </div>

        {/* Modèle IA */}
        <div className="border border-border rounded-xl bg-card p-6 space-y-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modèle IA</h2>

          {/* Provider */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Fournisseur</p>
            <div className="grid grid-cols-3 gap-3">
              {(providers.length > 0 ? providers : ['anthropic', 'openai', 'mistral']).map(p => {
                const meta       = PROVIDER_META[p] ?? { name: p, icon: () => null, selectedColor: 'text-primary' };
                const isSelected = p === provider;
                return (
                  <button
                    key={p}
                    onClick={() => setProvider(p)}
                    className={`relative flex flex-col items-center gap-2 py-4 px-3 rounded-xl text-sm font-medium transition-all border ${
                      isSelected
                        ? 'border-primary bg-primary/5 text-foreground shadow-sm ring-1 ring-primary/20'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-accent/50'
                    }`}
                  >
                    {isSelected && <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />}
                    {meta.icon(isSelected ? meta.selectedColor : 'text-muted-foreground')}
                    <span>{meta.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Modèle */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Modèle</p>
            <select className={inputCls} value={model} onChange={e => setModel(e.target.value)}>
              {filteredModels.map(m => (
                <option key={m.model_id} value={m.model_id}>
                  {m.model_id}{m.description ? ` — ${m.description}` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Ce modèle sera utilisé pour toutes les générations.</p>
          </div>
        </div>

        {/* Utilisation */}
        <div className="border border-border rounded-xl bg-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Utilisation</h2>
            <button onClick={onRefreshUsage} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Actualiser
            </button>
          </div>

          {usage ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-background border border-border rounded-xl p-4 space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Tokens consommés</p>
                <p className="text-2xl font-bold text-foreground tabular-nums">{usage.total_tokens.toLocaleString('fr-FR')}</p>
                {usage.max_tokens_cumul > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (usage.total_tokens / usage.max_tokens_cumul) * 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{Math.round((usage.total_tokens / usage.max_tokens_cumul) * 100)}% · max {usage.max_tokens_cumul.toLocaleString('fr-FR')}</p>
                  </div>
                )}
              </div>
              <div className="bg-background border border-border rounded-xl p-4 space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Générations effectuées</p>
                <p className="text-2xl font-bold text-foreground tabular-nums">{usage.total_appels}</p>
                {usage.max_appels > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (usage.total_appels / usage.max_appels) * 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{Math.round((usage.total_appels / usage.max_appels) * 100)}% · max {usage.max_appels}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          )}

          <div className="pt-1 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Remettre les compteurs à zéro</p>
            {confirmReset ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Confirmer ?</span>
                <button onClick={() => { onResetUsage(); setConfirmReset(false); }} className="text-xs px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">Oui</button>
                <button onClick={() => setConfirmReset(false)} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors">Annuler</button>
              </div>
            ) : (
              <button onClick={() => setConfirmReset(true)} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors">
                Réinitialiser
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Retour
          </button>
          <button
            onClick={handleSave}
            className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              saved
                ? 'bg-emerald-500 text-white'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {saved ? '✓ Enregistré' : 'Enregistrer'}
          </button>
        </div>

      </div>
    </div>
  );
}
