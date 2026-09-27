import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { consumeGoogleOAuthState, loginWithGoogleCode } from "./api";
import AuthLayout from "./components/AuthLayout";
import { Alert, AuthHeader } from "./components/fields";

type Props = { onSuccess: () => void };

export default function GoogleCallbackPage({ onSuccess }: Props) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code  = searchParams.get("code");
    const state = searchParams.get("state");
    const expectedState = consumeGoogleOAuthState();

    // Refus sur l'ecran Google, ou `state` absent / different : le retour ne
    // vient pas de la redirection lancee ici (protection CSRF).
    if (searchParams.get("error") || !code || !state || state !== expectedState) {
      setError(t("auth.login.googleCallbackError"));
      return;
    }

    loginWithGoogleCode(code)
      .then(onSuccess)
      .catch((err) => setError(err instanceof Error ? err.message : t("auth.login.googleCallbackError")));
  }, [searchParams, onSuccess, t]);

  return (
    <AuthLayout>
      {error ? (
        <>
          <AuthHeader title={t("auth.login.googleFailedTitle")} />
          <Alert tone="error">{error}</Alert>
          <button
            type="button"
            onClick={() => navigate("/login", { replace: true })}
            className="h-[52px] w-full cursor-pointer rounded-[8px] border-0 bg-l-blue text-[16px] font-semibold text-white hover:brightness-110"
          >
            {t("auth.login.backToLogin")}
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-4 py-10" role="status">
          <span aria-hidden className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[color:var(--l-blue)]" />
          <p className="m-0 text-[16px] text-[#C6D0E3]">{t("auth.login.googleCallbackLoading")}</p>
        </div>
      )}
    </AuthLayout>
  );
}
