// Decoupe depuis pages/DashboardPage.tsx (2026-09-12, refactoring par domaine).
// Deplacement pur : aucun changement de comportement.

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { inviteMember, listOrgMembers, removeOrgMember } from "../../org/api";
import { getMe } from "../../auth/api";
import type { User } from "../../../types";
import { SectionCard } from "./SectionCard";
import { inputStyle } from "../styles";

export function OrgMembersSection() {
  const { t } = useTranslation();
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const load = () => listOrgMembers().then(setMembers).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteResult(null);
    try {
      await inviteMember(inviteEmail);
      setInviteResult({ ok: true, message: t("dashboard.members.inviteSent", { email: inviteEmail }) });
      setInviteEmail("");
    } catch (e: unknown) {
      setInviteResult({ ok: false, message: e instanceof Error ? e.message : t("dashboard.members.inviteError") });
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setRemovingId(userId);
    setRemoveError(null);
    try {
      await removeOrgMember(userId);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    } catch (e: unknown) {
      setRemoveError(e instanceof Error ? e.message : t("dashboard.members.removeError"));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <SectionCard title={t("dashboard.members.title")}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--l-sub)" }}>
          {t("dashboard.members.hint")}
        </p>

        <form onSubmit={handleInvite} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder={t("dashboard.members.invitePlaceholder")}
            style={{ ...inputStyle, flex: 1, minWidth: 220 }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--l-blue)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--l-card-border)")}
          />
          <button
            type="submit"
            disabled={inviting}
            style={{
              padding: "0 20px",
              borderRadius: 7,
              border: "none",
              background: inviting ? "var(--l-dim)" : "var(--l-blue)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: inviting ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {inviting ? t("dashboard.members.inviting") : t("dashboard.members.invite")}
          </button>
        </form>

        {inviteResult && (
          <p style={{ margin: 0, fontSize: 12, color: inviteResult.ok ? "#16a34a" : "#dc2626" }}>
            {inviteResult.message}
          </p>
        )}
        {removeError && <p style={{ margin: 0, fontSize: 12, color: "#dc2626" }}>{removeError}</p>}

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--l-card-border)", borderTopColor: "var(--l-blue)", animation: "spin 1s linear infinite" }} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {members.map((m, i) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 0",
                  borderTop: i > 0 ? "1px solid var(--l-card-border)" : undefined,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--l-text)" }}>
                    {m.prenom} {m.nom}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--l-sub)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(m.id)}
                  disabled={removingId === m.id}
                  style={{
                    flexShrink: 0,
                    padding: "6px 12px",
                    borderRadius: 7,
                    border: "1px solid rgba(220,38,38,0.25)",
                    background: "transparent",
                    color: "#dc2626",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: removingId === m.id ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {removingId === m.id ? t("dashboard.members.removing") : t("dashboard.members.remove")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
