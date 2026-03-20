import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Model, UsageData } from '../types';

type Section = 'general' | 'utilisation';

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

const PROVIDERS: { id: string; label: string; description: string }[] = [
  { id: 'anthropic', label: 'Anthropic',  description: 'Claude — Meilleur pour la rédaction complexe' },
  { id: 'openai',    label: 'OpenAI',     description: 'GPT-4o — Polyvalent et rapide' },
  { id: 'mistral',   label: 'Mistral',    description: 'Mistral — Souveraineté européenne des données' },
];

export default function SettingsPage({
  provider, setProvider, model, setModel, models,
  usage, onRefreshUsage, onResetUsage,
}: Props) {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>('general');
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const filteredModels = models.filter(m => m.provider === provider);

  function handleSave() {
    setSaved(true);
    setTimeout(() => { setSaved(false); navigate(-1); }, 900);
  }

  return (
    <div className="flex-1 flex min-h-screen bg-background">

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 px-3 py-10 border-r border-border">
        <h1 className="text-2xl font-semibold text-foreground px-3 mb-6">Paramètres</h1>
        <nav className="flex flex-col gap-0.5">
          {([
            { id: 'general',     label: 'Général' },
            { id: 'utilisation', label: 'Utilisation' },
          ] as { id: Section; label: string }[]).map(item => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                section === item.id
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Content ─────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-12 py-10 max-w-2xl">

        {section === 'general' && (
          <div className="space-y-8">
            <h2 className="text-xl font-semibold text-foreground">Modèle IA</h2>

            {/* Provider */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">Fournisseur</label>
              <div className="flex flex-col gap-2">
                {PROVIDERS.filter(p => models.some(m => m.provider === p.id) || models.length === 0).map(p => {
                  const isSelected = p.id === provider;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setProvider(p.id)}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-foreground/20 bg-muted'
                          : 'border-border hover:border-foreground/10 hover:bg-muted/40'
                      }`}
                    >
                      <div>
                        <p className={`text-sm font-medium ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {p.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                      </div>
                      <div className={`h-4 w-4 rounded-full border-2 flex-shrink-0 transition-all ${
                        isSelected ? 'border-foreground bg-foreground' : 'border-border'
                      }`}>
                        {isSelected && <div className="h-full w-full rounded-full bg-background scale-[0.4]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Modèle */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Modèle</label>
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-border rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20 transition-all"
              >
                {filteredModels.map(m => (
                  <option key={m.model_id} value={m.model_id}>
                    {m.model_id}{m.description ? ` — ${m.description}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Utilisé pour toutes les générations et le chat.</p>
            </div>

            {/* Save */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSave}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                  saved
                    ? 'bg-emerald-500 text-white'
                    : 'bg-foreground text-background hover:bg-foreground/90'
                }`}
              >
                {saved ? '✓ Enregistré' : 'Enregistrer'}
              </button>
              <button
                onClick={() => navigate(-1)}
                className="px-5 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 transition-all"
              >
                Retour
              </button>
            </div>
          </div>
        )}

        {section === 'utilisation' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Utilisation</h2>
              <button
                onClick={onRefreshUsage}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Actualiser
              </button>
            </div>

            {usage ? (
              <div className="space-y-6">

                {/* Tokens génération */}
                <div className="space-y-2">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Tokens de génération</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Brief stratégique + réponse AO + chat inclus</p>
                    </div>
                    <span className="text-2xl font-semibold text-foreground tabular-nums">
                      {usage.total_tokens.toLocaleString('fr-FR')}
                    </span>
                  </div>
                  {usage.max_tokens_cumul > 0 && (
                    <div className="space-y-1">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-foreground transition-all"
                          style={{ width: `${Math.min(100, (usage.total_tokens / usage.max_tokens_cumul) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {usage.total_tokens.toLocaleString('fr-FR')} / {usage.max_tokens_cumul.toLocaleString('fr-FR')} tokens ({Math.round((usage.total_tokens / usage.max_tokens_cumul) * 100)}%)
                      </p>
                    </div>
                  )}
                </div>

                <div className="border-t border-border" />

                {/* Générations */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Réponses AO générées</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Appels complets uniquement</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-semibold text-foreground tabular-nums">{usage.total_appels}</span>
                    {usage.max_appels > 0 && (
                      <p className="text-xs text-muted-foreground">/ {usage.max_appels} max</p>
                    )}
                  </div>
                </div>

                <div className="border-t border-border" />

                {/* OCR */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Tokens OCR</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      GPT-4o vision — PDFs scannés uniquement
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-2xl font-semibold tabular-nums ${usage.total_tokens_ocr > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      {usage.total_tokens_ocr.toLocaleString('fr-FR')}
                    </span>
                    {usage.total_tokens_ocr === 0 && (
                      <p className="text-xs text-muted-foreground">Aucun PDF scanné</p>
                    )}
                  </div>
                </div>

                <div className="border-t border-border" />

                {/* Reset */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Réinitialiser les compteurs</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Remet tous les compteurs à zéro</p>
                  </div>
                  {confirmReset ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Confirmer ?</span>
                      <button
                        onClick={() => { onResetUsage(); setConfirmReset(false); }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                      >
                        Réinitialiser
                      </button>
                      <button
                        onClick={() => setConfirmReset(false)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmReset(true)}
                      className="text-sm text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      Réinitialiser
                    </button>
                  )}
                </div>

              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
