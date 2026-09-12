// Assistance IA contextualisee sur l'AO courant et l'etape courante.
//
// Tiroir repliable plutot qu'un panneau permanent : l'etape et sa porte de
// validation restent le sujet principal de l'ecran.
//
// L'assistant repond via askStepAssistant, qui reutilise ChatService cote
// backend -- c'est le meme assistant que le chat du produit, avec un cadrage
// par etape, pas un second systeme de conversation.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { askStepAssistant } from "../api";
import type { AoStepKey } from "../types";

type Tour = { role: "user" | "assistant"; content: string; sources?: string[] };

export function StepAssistant({ aoId, stepKey }: { aoId: string; stepKey: AoStepKey }) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = useState(false);
  const [tours, setTours] = useState<Tour[]>([]);
  const [question, setQuestion] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer() {
    const q = question.trim();
    if (!q || enCours) return;

    const historique: Tour[] = [...tours, { role: "user", content: q }];
    setTours(historique);
    setQuestion("");
    setEnCours(true);
    setErreur(null);

    try {
      const rep = await askStepAssistant(
        aoId,
        stepKey,
        historique.map((m) => ({ role: m.role, content: m.content })),
      );
      setTours([...historique, { role: "assistant", content: rep.answer, sources: rep.sources }]);
    } catch (e: unknown) {
      setErreur(e instanceof Error ? e.message : t("pipeline.assist.failed"));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid var(--l-card-border)",
        background: "var(--l-card)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOuvert((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "12px 16px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="var(--l-blue)" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 10.5h8M8 14h5m-5 6.5l-3.5-3.5H4A2 2 0 012 15V6a2 2 0 012-2h16a2 2 0 012 2v9a2 2 0 01-2 2h-8l-4 3.5z"
          />
        </svg>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--l-text)" }}>
          {t("pipeline.assist.title")}
        </span>
        <span style={{ fontSize: 11, color: "var(--l-dim)" }}>
          {ouvert ? t("pipeline.assist.hide") : t("pipeline.assist.show")}
        </span>
      </button>

      {ouvert && (
        <div
          style={{
            padding: "0 16px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            borderTop: "1px solid var(--l-card-border)",
          }}
        >
          <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--l-sub)", lineHeight: 1.5 }}>
            {t(`pipeline.assist.role.${stepKey}`)}
          </p>

          {tours.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 9, maxHeight: 320, overflowY: "auto" }}>
              {tours.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "88%",
                    padding: "9px 12px",
                    borderRadius: 10,
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background: m.role === "user" ? "var(--l-blue-a)" : "var(--l-input-bg)",
                    color: "var(--l-text)",
                  }}
                >
                  {m.content}
                  {m.sources && m.sources.length > 0 && (
                    <p style={{ margin: "7px 0 0", fontSize: 10.5, color: "var(--l-dim)" }}>
                      {t("pipeline.assist.sources")} {m.sources.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {erreur && <p style={{ margin: 0, fontSize: 12, color: "var(--l-error)" }}>{erreur}</p>}

          <div style={{ display: "flex", gap: 7 }}>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  envoyer();
                }
              }}
              placeholder={t("pipeline.assist.placeholder")}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "10px 12px",
                borderRadius: 9,
                border: "1px solid var(--l-card-border)",
                background: "var(--l-input-bg)",
                color: "var(--l-text)",
                fontSize: 12.5,
                outline: "none",
              }}
            />
            <button
              onClick={envoyer}
              disabled={enCours || !question.trim()}
              style={{
                border: "none",
                borderRadius: 9,
                padding: "10px 15px",
                fontSize: 12.5,
                fontWeight: 600,
                background: "var(--l-blue)",
                color: "#fff",
                cursor: enCours || !question.trim() ? "not-allowed" : "pointer",
                opacity: enCours || !question.trim() ? 0.55 : 1,
              }}
            >
              {enCours ? t("pipeline.assist.thinking") : t("pipeline.assist.send")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
