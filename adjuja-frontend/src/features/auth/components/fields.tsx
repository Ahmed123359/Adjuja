// Pieces de formulaire des pages d'authentification -- 2026-09-27.
//
// Remplacent les styles inline recopies dans chaque page (bordure changee a la
// main dans onFocus/onBlur, textes a 12-13px, labels non relies a leur champ).
// Tout est en classes, texte >= 14px, champs a 16px (en dessous, iOS zoome a
// la saisie), labels relies par htmlFor, erreurs annoncees (role="alert").

import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

const champ =
  "h-12 w-full rounded-[8px] border border-l-border-strong bg-white/[0.04] px-4 text-[16px] text-white outline-none transition-colors placeholder:text-white/35 hover:border-white/25 focus:border-[color:var(--l-blue)] focus:bg-white/[0.06] aria-[invalid=true]:border-[color:var(--l-neg)]";

/** Titre + phrase d'accroche d'un ecran. */
export function AuthHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="m-0 text-[clamp(1.9rem,3vw,2.4rem)] font-extrabold leading-[1.1] tracking-[-.03em] text-white">{title}</h1>
      {subtitle && <p className="m-0 mt-3 text-[16px] leading-[1.6] text-[#C6D0E3]">{subtitle}</p>}
    </div>
  );
}

/** Libelle relie au champ, action facultative a droite (« Mot de passe oublie ? »). */
export function Field({ label, htmlFor, action, hint, children }: {
  label: string; htmlFor: string; action?: ReactNode; hint?: ReactNode; children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[15px] font-semibold text-white">{label}</label>
        {action}
      </div>
      {children}
      {hint && <div className="mt-2">{hint}</div>}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${champ} ${props.className ?? ""}`} />;
}

/** Mot de passe avec bouton afficher / masquer. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${champ} pr-12`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("auth.common.hidePassword") : t("auth.common.showPassword")}
        aria-pressed={visible}
        className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[6px] border-0 bg-transparent text-white/55 transition-colors hover:text-white"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          {visible ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 8.5 4.2 9.5 7-.4 1.1-1.2 2.4-2.3 3.6M6.6 6.6C4.6 8 3.1 10 2.5 12c1 2.8 4.5 7 9.5 7 1.8 0 3.4-.5 4.8-1.3" />
          ) : (
            <>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12c1-2.8 4.5-7 9.5-7s8.5 4.2 9.5 7c-1 2.8-4.5 7-9.5 7s-8.5-4.2-9.5-7z" />
              <circle cx="12" cy="12" r="2.5" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

/** Regles du mot de passe verifiees a la frappe. */
export function PasswordRulesHint({ password, minLength, requireDigit }: { password: string; minLength: number; requireDigit: boolean }) {
  const { t } = useTranslation();
  const regles = [
    { ok: password.length >= minLength, label: t("auth.common.ruleLength", { min: minLength }) },
    ...(requireDigit ? [{ ok: /\d/.test(password), label: t("auth.common.ruleDigit") }] : []),
  ];
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0">
      {regles.map((r) => (
        <li key={r.label} className={`flex items-center gap-1.5 text-[14px] transition-colors ${r.ok ? "text-[color:var(--l-pos)]" : "text-white/55"}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
            {r.ok ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /> : <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />}
          </svg>
          {r.label}
        </li>
      ))}
    </ul>
  );
}

/** Code a 6 chiffres : un seul vrai champ (collage, remplissage automatique
 *  « one-time-code » des messageries), affiche en six cases. */
export function OtpInput({ value, onChange, autoFocus, invalid }: {
  value: string; onChange: (v: string) => void; autoFocus?: boolean; invalid?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [focus, setFocus] = useState(false);
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{t("auth.common.codeLabel")}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        className="absolute inset-0 z-[1] h-full w-full cursor-text opacity-0"
      />
      <div aria-hidden className="grid grid-cols-6 gap-2 sm:gap-3">
        {Array.from({ length: 6 }, (_, i) => {
          const courant = focus && i === Math.min(value.length, 5);
          return (
            <div
              key={i}
              className={`flex h-14 items-center justify-center rounded-[8px] border text-[26px] font-bold tabular-nums text-white transition-colors sm:h-16 ${
                invalid ? "border-[color:var(--l-neg)]" : courant ? "border-[color:var(--l-blue)] bg-white/[0.06]" : "border-l-border-strong bg-white/[0.04]"
              }`}
            >
              {value[i] ?? (courant ? <span className="h-7 w-[2px] animate-pulse bg-[var(--l-blue)]" /> : "")}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** « Renvoyer le code », bloque 60 s apres chaque envoi. */
export function ResendCode({ onResend }: { onResend: () => Promise<void> }) {
  const { t } = useTranslation();
  const [reste, setReste] = useState(60);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState("");
  const minuteur = useRef<number | null>(null);

  useEffect(() => {
    if (reste <= 0) return;
    minuteur.current = window.setTimeout(() => setReste((r) => r - 1), 1000);
    return () => { if (minuteur.current) window.clearTimeout(minuteur.current); };
  }, [reste]);

  async function renvoyer() {
    setEnvoi(true); setMessage("");
    try {
      await onResend();
      setMessage(t("auth.common.codeResent"));
      setReste(60);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("auth.common.genericError"));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <p className="m-0 text-center text-[15px] text-[#C6D0E3]" aria-live="polite">
      {t("auth.common.noCode")}{" "}
      {reste > 0 ? (
        <span className="tabular-nums text-white/55">{t("auth.common.resendIn", { s: reste })}</span>
      ) : (
        <button type="button" onClick={renvoyer} disabled={envoi} className="cursor-pointer border-0 bg-transparent p-0 text-[15px] font-semibold text-[color:var(--l-blue-soft)] hover:text-white disabled:opacity-60">
          {t("auth.common.resend")}
        </button>
      )}
      {message && <span className="mt-2 block text-[14px] text-white/70">{message}</span>}
    </p>
  );
}

export function Alert({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const erreur = tone === "error";
  return (
    <div
      role={erreur ? "alert" : "status"}
      className={`mb-6 flex gap-3 rounded-[8px] border px-4 py-3 text-[15px] leading-[1.5] ${
        erreur
          ? "border-[color:color-mix(in_srgb,var(--l-neg)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--l-neg)_10%,transparent)] text-[#FFB4AE]"
          : "border-[color:color-mix(in_srgb,var(--l-pos)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--l-pos)_10%,transparent)] text-[#8FE3C0]"
      }`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className="mt-px shrink-0">
        {erreur
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5m0 3h.01M10.3 3.9L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />}
      </svg>
      <span>{children}</span>
    </div>
  );
}

export function SubmitButton({ loading, disabled, children, loadingLabel }: {
  loading: boolean; disabled?: boolean; children: ReactNode; loadingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      className="flex h-[52px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-[8px] border-0 bg-l-blue text-[16px] font-semibold text-white transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
    >
      {loading && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {loading ? loadingLabel : children}
    </button>
  );
}

/** Bouton Google : aux couleurs imposees par Google (fond blanc, logo en couleur). */
export function GoogleButton({ label, onClick }: { label: string; onClick: () => void }) {
  const [depart, setDepart] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { setDepart(true); onClick(); }}
      disabled={depart}
      className="flex h-[52px] w-full cursor-pointer items-center justify-center gap-3 rounded-[8px] border-0 bg-white text-[16px] font-semibold text-[#1F1F1F] transition-[filter] hover:brightness-95 disabled:cursor-wait disabled:opacity-70"
    >
      {depart ? (
        <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black/70" />
      ) : (
        <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden>
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.8 2.73v2.27h2.92c1.71-1.57 2.68-3.88 2.68-6.64z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.27c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z"/>
          <path fill="#FBBC05" d="M3.97 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.96H.96A8.996 8.996 0 000 9c0 1.45.35 2.83.96 4.04l3.01-2.34z"/>
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
        </svg>
      )}
      {label}
    </button>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="my-6 flex items-center gap-4">
      <span className="h-px flex-1 bg-l-border-strong" />
      <span className="text-[14px] font-medium text-white/55">{label}</span>
      <span className="h-px flex-1 bg-l-border-strong" />
    </div>
  );
}

/** Lien d'action discret en ligne (« Creer un compte », « Retour »). */
export function TextLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="cursor-pointer border-0 bg-transparent p-0 text-[15px] font-semibold text-[color:var(--l-blue-soft)] transition-colors hover:text-white">
      {children}
    </button>
  );
}

/** Pastille avec une icone, en tete des ecrans « verifiez vos emails ». */
export function MailBadge() {
  return (
    <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-[12px] border border-l-border-strong bg-[color:color-mix(in_srgb,var(--l-blue)_14%,transparent)] text-[color:var(--l-blue-soft)]">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9 6 9-6M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
      </svg>
    </div>
  );
}
