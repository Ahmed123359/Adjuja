// Inscription -- refaite le 2026-09-27.
//
// Huit champs sur un seul ecran a 12-13px devenaient deux etapes : « vous »
// (identite, email, mot de passe) puis « votre entreprise ». La verification
// par code suit : six cases, collage et remplissage automatique acceptes,
// renvoi du code (rappeler /register avec les memes donnees en genere un
// nouveau), et retour a l'etape 1 pour corriger une adresse mal saisie.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getPasswordRules, register, startGoogleLogin, verifyOtp, type PasswordRules } from "./api";
import AuthLayout from "./components/AuthLayout";
import {
  Alert, AuthHeader, Divider, Field, GoogleButton, MailBadge, OtpInput, PasswordInput,
  PasswordRulesHint, ResendCode, SubmitButton, TextInput, TextLink,
} from "./components/fields";

type Props = { onSuccess: () => void; onGoLogin: () => void };
type Etape = "vous" | "entreprise" | "code";

function Progression({ etape }: { etape: 1 | 2 }) {
  const { t } = useTranslation();
  return (
    <div className="mb-7">
      <p className="m-0 text-[14px] font-semibold text-[color:var(--l-blue-soft)]">{t("auth.register.step", { n: etape, total: 2 })}</p>
      <div className="mt-2.5 flex gap-1.5" aria-hidden>
        {[1, 2].map((n) => (
          <span key={n} className={`h-[4px] flex-1 rounded-full transition-colors duration-300 ${n <= etape ? "bg-l-blue" : "bg-white/10"}`} />
        ))}
      </div>
    </div>
  );
}

export default function RegisterPage({ onSuccess, onGoLogin }: Props) {
  const { t } = useTranslation();
  const [etape, setEtape] = useState<Etape>("vous");

  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [entreprise, setEntreprise] = useState("");
  const [secteur, setSecteur] = useState("");
  const [nbAo, setNbAo] = useState("");
  const [cgu, setCgu] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [rules, setRules] = useState<PasswordRules>({ min_length: 8, require_digit: true });
  const envoiCode = useRef(false);

  useEffect(() => { getPasswordRules().then(setRules); }, []);

  const secteurs = Object.entries(t("auth.register.sectorOptions", { returnObjects: true }) as Record<string, string>);
  const motDePasseOk = password.length >= rules.min_length && (!rules.require_digit || /\d/.test(password));

  function envoyer() {
    return register({
      nom: nom.trim(), prenom: prenom.trim(), email: email.trim(), password,
      entreprise: entreprise.trim(), secteur_activite: secteur,
      nb_ao_par_an: nbAo === "" ? null : Number(nbAo),
    });
  }

  function continuer(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!motDePasseOk) { setError(t("auth.register.passwordRulesError")); return; }
    setEtape("entreprise");
  }

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const admin = await envoyer();
      if (admin) onSuccess();
      else { setOtp(""); setEtape("code"); }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.common.genericError"));
    } finally {
      setLoading(false);
    }
  }

  async function verifier(code: string) {
    if (envoiCode.current || code.length !== 6) return;
    envoiCode.current = true;
    setError("");
    setLoading(true);
    try {
      await verifyOtp(email.trim(), code);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.verify.otpError"));
    } finally {
      envoiCode.current = false;
      setLoading(false);
    }
  }

  // Envoi automatique des que les six chiffres sont saisis ou colles.
  useEffect(() => {
    if (etape === "code" && otp.length === 6) void verifier(otp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, etape]);

  if (etape === "code") {
    return (
      <AuthLayout>
        <MailBadge />
        <AuthHeader
          title={t("auth.verify.title")}
          subtitle={<>{t("auth.verify.sent")} <strong className="font-semibold text-white">{email.trim()}</strong>. {t("auth.verify.instructionShort")}</>}
        />
        {error && <Alert tone="error">{error}</Alert>}
        <form onSubmit={(e) => { e.preventDefault(); void verifier(otp); }} className="flex flex-col gap-6">
          <OtpInput value={otp} onChange={(v) => { setOtp(v); if (error) setError(""); }} autoFocus invalid={!!error} />
          <SubmitButton loading={loading} disabled={otp.length !== 6} loadingLabel={t("auth.verify.verifying")}>
            {t("auth.verify.confirm")}
          </SubmitButton>
        </form>
        <div className="mt-6 flex flex-col items-center gap-4">
          <ResendCode onResend={async () => { await envoyer(); }} />
          <TextLink onClick={() => { setError(""); setEtape("vous"); }}>{t("auth.verify.changeEmail")}</TextLink>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthHeader title={t("auth.register.title")} subtitle={t("auth.register.subtitle")} />
      <Progression etape={etape === "vous" ? 1 : 2} />
      {error && <Alert tone="error">{error}</Alert>}

      {etape === "vous" ? (
        <>
          <form onSubmit={continuer} className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t("auth.register.firstName")} htmlFor="reg-prenom">
                <TextInput id="reg-prenom" autoComplete="given-name" required autoFocus value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder={t("auth.register.firstNamePlaceholder")} />
              </Field>
              <Field label={t("auth.register.lastName")} htmlFor="reg-nom">
                <TextInput id="reg-nom" autoComplete="family-name" required value={nom} onChange={(e) => setNom(e.target.value)} placeholder={t("auth.register.lastNamePlaceholder")} />
              </Field>
            </div>
            <Field label={t("auth.register.email")} htmlFor="reg-email">
              <TextInput id="reg-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("auth.register.emailPlaceholder")} />
            </Field>
            <Field
              label={t("auth.register.password")}
              htmlFor="reg-password"
              hint={<PasswordRulesHint password={password} minLength={rules.min_length} requireDigit={rules.require_digit} />}
            >
              <PasswordInput id="reg-password" autoComplete="new-password" required minLength={rules.min_length} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("auth.register.passwordPlaceholder")} />
            </Field>
            <div className="mt-1">
              <SubmitButton loading={false} loadingLabel="">{t("auth.register.continue")}</SubmitButton>
            </div>
          </form>

          <Divider label={t("auth.register.or")} />
          <GoogleButton label={t("auth.register.continueWithGoogle")} onClick={startGoogleLogin} />
        </>
      ) : (
        <form onSubmit={creer} className="flex flex-col gap-5">
          <Field label={t("auth.register.companyName")} htmlFor="reg-entreprise">
            <TextInput id="reg-entreprise" autoComplete="organization" required autoFocus value={entreprise} onChange={(e) => setEntreprise(e.target.value)} placeholder={t("auth.register.companyNamePlaceholder")} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-[1.5fr_1fr]">
            <Field label={t("auth.register.sector")} htmlFor="reg-secteur">
              {/* Select natif : clavier, lecteurs d'ecran et mobile sans code ;
                  color-scheme sombre pour que la liste deroulante suive. */}
              <div className="relative">
                <select
                  id="reg-secteur"
                  required
                  value={secteur}
                  onChange={(e) => setSecteur(e.target.value)}
                  className={`h-12 w-full cursor-pointer appearance-none rounded-[8px] border border-l-border-strong bg-white/[0.04] pl-4 pr-10 text-[16px] outline-none transition-colors [color-scheme:dark] hover:border-white/25 focus:border-[color:var(--l-blue)] ${secteur ? "text-white" : "text-white/35"}`}
                >
                  <option value="" disabled>{t("auth.register.sectorPlaceholder")}</option>
                  {secteurs.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                </select>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-white/55">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </Field>
            <Field label={t("auth.register.aoPerYear")} htmlFor="reg-nbao">
              <TextInput id="reg-nbao" type="number" inputMode="numeric" min={0} max={10000} required value={nbAo} onChange={(e) => setNbAo(e.target.value)} placeholder={t("auth.register.aoPerYearPlaceholder")} />
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-[1.5] text-[#C6D0E3]">
            <input
              type="checkbox"
              required
              checked={cgu}
              onChange={(e) => setCgu(e.target.checked)}
              className="mt-[3px] h-[18px] w-[18px] shrink-0 cursor-pointer accent-[var(--l-blue)]"
            />
            <span>
              {t("legal.acceptPrefix")}
              <Link to="/cgu" target="_blank" className="font-semibold text-[color:var(--l-blue-soft)] no-underline hover:text-white">{t("legal.acceptCgu")}</Link>
              {t("legal.acceptAnd")}
              <Link to="/confidentialite" target="_blank" className="font-semibold text-[color:var(--l-blue-soft)] no-underline hover:text-white">{t("legal.acceptPrivacy")}</Link>
            </span>
          </label>

          <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => { setError(""); setEtape("vous"); }}
              className="h-[52px] cursor-pointer rounded-[8px] border border-l-border-strong bg-transparent px-6 text-[16px] font-semibold text-white transition-colors hover:border-white/40 sm:w-auto"
            >
              {t("auth.register.back")}
            </button>
            <div className="flex-1">
              <SubmitButton loading={loading} disabled={!cgu || !secteur} loadingLabel={t("auth.register.submitting")}>
                {t("auth.register.submit")}
              </SubmitButton>
            </div>
          </div>
        </form>
      )}

      <p className="m-0 mt-8 text-center text-[15px] text-[#C6D0E3]">
        {t("auth.register.hasAccount")} <TextLink onClick={onGoLogin}>{t("auth.register.loginLink")}</TextLink>
      </p>
    </AuthLayout>
  );
}
