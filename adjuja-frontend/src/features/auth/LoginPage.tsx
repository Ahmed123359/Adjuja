import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { login, startGoogleLogin } from "./api";
import AuthLayout from "./components/AuthLayout";
import { Alert, AuthHeader, Divider, Field, GoogleButton, PasswordInput, SubmitButton, TextInput, TextLink } from "./components/fields";

type Props = { onSuccess: () => void; onGoRegister: () => void; onGoForgotPassword: () => void };

export default function LoginPage({ onSuccess, onGoRegister, onGoForgotPassword }: Props) {
  const { t } = useTranslation();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [searchParams] = useSearchParams();
  const justVerified = searchParams.get("verified") === "true";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      onSuccess();
    } catch (err) {
      // Avant le 2026-09-27, le repli affichait « Connexion… » (le libelle de
      // chargement) comme message d'erreur.
      setError(err instanceof Error ? err.message : t("auth.common.genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <AuthHeader title={t("auth.login.title")} subtitle={t("auth.login.subtitle")} />

      {justVerified && <Alert tone="success">{t("auth.login.verified")}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field label={t("auth.login.email")} htmlFor="login-email">
          <TextInput
            id="login-email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.login.emailPlaceholder")}
            aria-invalid={!!error || undefined}
          />
        </Field>

        <Field
          label={t("auth.login.password")}
          htmlFor="login-password"
          action={<TextLink onClick={onGoForgotPassword}>{t("auth.login.forgotPassword")}</TextLink>}
        >
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.login.passwordPlaceholder")}
            aria-invalid={!!error || undefined}
          />
        </Field>

        <div className="mt-1">
          <SubmitButton loading={loading} loadingLabel={t("auth.login.submitting")}>
            {t("auth.login.submit")}
          </SubmitButton>
        </div>
      </form>

      <Divider label={t("auth.login.or")} />
      <GoogleButton label={t("auth.login.continueWithGoogle")} onClick={startGoogleLogin} />

      <p className="m-0 mt-8 text-center text-[15px] text-[#C6D0E3]">
        {t("auth.login.noAccount")} <TextLink onClick={onGoRegister}>{t("auth.login.createAccount")}</TextLink>
      </p>
    </AuthLayout>
  );
}
