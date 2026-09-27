// Acceptation d'une invitation d'equipe -- refaite le 2026-09-27 sur les
// pieces communes des ecrans d'authentification.

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getPasswordRules, type PasswordRules } from "./api";
import { acceptInvite, previewInvite, type InvitePreview } from "../org/api";
import AuthLayout from "./components/AuthLayout";
import { Alert, AuthHeader, Field, PasswordInput, PasswordRulesHint, SubmitButton, TextInput } from "./components/fields";

type Props = { onSuccess: () => void };

export default function AcceptInvitePage({ onSuccess }: Props) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [chargement, setChargement] = useState(true);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState("");

  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [rules, setRules] = useState<PasswordRules>({ min_length: 8, require_digit: true });

  useEffect(() => { getPasswordRules().then(setRules); }, []);

  useEffect(() => {
    if (!token) { setLoadError(t("auth.invite.invalid")); setChargement(false); return; }
    previewInvite(token)
      .then(setPreview)
      .catch((err) => setLoadError(err instanceof Error ? err.message : t("auth.invite.invalid")))
      .finally(() => setChargement(false));
  }, [token, t]);

  const motDePasseOk = password.length >= rules.min_length && (!rules.require_digit || /\d/.test(password));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!motDePasseOk) { setError(t("auth.register.passwordRulesError")); return; }
    setSubmitting(true);
    try {
      await acceptInvite(token, nom.trim(), prenom.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.invite.acceptError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (chargement) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center gap-4 py-10" role="status">
          <span aria-hidden className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[color:var(--l-blue)]" />
          <p className="m-0 text-[15px] text-[#C6D0E3]">{t("auth.invite.loading")}</p>
        </div>
      </AuthLayout>
    );
  }

  if (loadError || !preview) {
    return (
      <AuthLayout>
        <AuthHeader title={t("auth.invite.invalidTitle")} />
        <Alert tone="error">{loadError || t("auth.invite.invalid")}</Alert>
        <Link to="/login" className="flex h-[52px] items-center justify-center rounded-[8px] bg-l-blue text-[16px] font-semibold text-white no-underline hover:brightness-110">
          {t("auth.verify.goLogin")}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthHeader
        title={t("auth.invite.title", { name: preview.inviter_name })}
        subtitle={<>{t("auth.invite.forEmail")} <strong className="font-semibold text-white">{preview.email}</strong></>}
      />
      {error && <Alert tone="error">{error}</Alert>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("auth.register.firstName")} htmlFor="inv-prenom">
            <TextInput id="inv-prenom" autoComplete="given-name" required autoFocus value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder={t("auth.register.firstNamePlaceholder")} />
          </Field>
          <Field label={t("auth.register.lastName")} htmlFor="inv-nom">
            <TextInput id="inv-nom" autoComplete="family-name" required value={nom} onChange={(e) => setNom(e.target.value)} placeholder={t("auth.register.lastNamePlaceholder")} />
          </Field>
        </div>
        {/* Adresse imposee par l'invitation : presente pour les gestionnaires
            de mots de passe, non modifiable. */}
        <input type="email" autoComplete="username" value={preview.email} readOnly hidden />
        <Field
          label={t("auth.register.password")}
          htmlFor="inv-password"
          hint={<PasswordRulesHint password={password} minLength={rules.min_length} requireDigit={rules.require_digit} />}
        >
          <PasswordInput id="inv-password" autoComplete="new-password" required minLength={rules.min_length} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("auth.register.passwordPlaceholder")} />
        </Field>
        <div className="mt-1">
          <SubmitButton loading={submitting} loadingLabel={t("auth.invite.accepting")}>{t("auth.invite.accept")}</SubmitButton>
        </div>
      </form>
    </AuthLayout>
  );
}
