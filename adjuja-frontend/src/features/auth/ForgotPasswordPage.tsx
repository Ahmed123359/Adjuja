// Mot de passe oublie -- refait le 2026-09-27.
//
// Deux temps : l'adresse, puis le code recu et le nouveau mot de passe sur le
// meme ecran (le serveur verifie les deux ensemble). Le serveur repond de la
// meme facon que le compte existe ou non (pas d'enumeration) : le texte dit
// donc « si un compte existe », jamais « code envoye a votre compte ».

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { forgotPassword, getPasswordRules, resetPassword, type PasswordRules } from "./api";
import AuthLayout from "./components/AuthLayout";
import {
  Alert, AuthHeader, Field, MailBadge, OtpInput, PasswordInput, PasswordRulesHint,
  ResendCode, SubmitButton, TextInput, TextLink,
} from "./components/fields";

type Props = { onSuccess: () => void; onGoLogin: () => void };

export default function ForgotPasswordPage({ onSuccess, onGoLogin }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [codeEnvoye, setCodeEnvoye] = useState(false);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState<PasswordRules>({ min_length: 8, require_digit: true });

  useEffect(() => { getPasswordRules().then(setRules); }, []);

  const motDePasseOk = password.length >= rules.min_length && (!rules.require_digit || /\d/.test(password));

  async function demander(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setCodeEnvoye(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.common.genericError"));
    } finally {
      setLoading(false);
    }
  }

  async function reinitialiser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!motDePasseOk) { setError(t("auth.register.passwordRulesError")); return; }
    setLoading(true);
    try {
      await resetPassword(email.trim(), otp, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.forgot.resetError"));
    } finally {
      setLoading(false);
    }
  }

  if (codeEnvoye) {
    return (
      <AuthLayout>
        <MailBadge />
        <AuthHeader
          title={t("auth.forgot.otpTitle")}
          subtitle={<>{t("auth.forgot.otpSentIfExists")} <strong className="font-semibold text-white">{email.trim()}</strong>.</>}
        />
        {error && <Alert tone="error">{error}</Alert>}
        <form onSubmit={reinitialiser} className="flex flex-col gap-6">
          <OtpInput value={otp} onChange={(v) => { setOtp(v); if (error) setError(""); }} autoFocus />
          <Field
            label={t("auth.forgot.newPassword")}
            htmlFor="reset-password"
            hint={<PasswordRulesHint password={password} minLength={rules.min_length} requireDigit={rules.require_digit} />}
          >
            <PasswordInput id="reset-password" autoComplete="new-password" required minLength={rules.min_length} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("auth.forgot.newPasswordPlaceholder")} />
          </Field>
          <SubmitButton loading={loading} disabled={otp.length !== 6 || !password} loadingLabel={t("auth.forgot.resetting")}>
            {t("auth.forgot.resetSubmit")}
          </SubmitButton>
        </form>
        <div className="mt-6 flex flex-col items-center gap-4">
          <ResendCode onResend={() => forgotPassword(email.trim())} />
          <TextLink onClick={() => { setError(""); setOtp(""); setCodeEnvoye(false); }}>{t("auth.verify.changeEmail")}</TextLink>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthHeader title={t("auth.forgot.title")} subtitle={t("auth.forgot.subtitle")} />
      {error && <Alert tone="error">{error}</Alert>}
      <form onSubmit={demander} className="flex flex-col gap-5">
        <Field label={t("auth.forgot.email")} htmlFor="forgot-email">
          <TextInput id="forgot-email" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("auth.forgot.emailPlaceholder")} />
        </Field>
        <div className="mt-1">
          <SubmitButton loading={loading} loadingLabel={t("auth.forgot.submitting")}>{t("auth.forgot.submit")}</SubmitButton>
        </div>
      </form>
      <p className="m-0 mt-8 text-center">
        <TextLink onClick={onGoLogin}><span aria-hidden>←</span> {t("auth.forgot.backToLogin")}</TextLink>
      </p>
    </AuthLayout>
  );
}
