import { useEffect } from "react";
import { useTranslation } from "react-i18next";

type Props = { onGoHome: () => void };

/** URL sans correspondance : jusqu'ici le catch-all redirigeait silencieusement vers
 * l'accueil (code 200, contenu dupliqué, indexable). On affiche un vrai message et on
 * force noindex pendant que la page est montée, pour ne plus produire de pages
 * fantômes potentiellement indexées. */
export default function NotFoundPage({ onGoHome }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    const meta = document.querySelector('meta[name="robots"]');
    const previous = meta?.getAttribute("content") ?? "index, follow";
    meta?.setAttribute("content", "noindex, nofollow");
    return () => { meta?.setAttribute("content", previous); };
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: "var(--l-bg)", color: "var(--l-text)" }}
    >
      <p className="text-[64px] font-extrabold leading-none" style={{ color: "var(--l-blue)" }}>404</p>
      <p className="text-lg font-semibold m-0">{t("notFound.title")}</p>
      <p className="text-sm m-0 max-w-md" style={{ color: "var(--l-sub)" }}>{t("notFound.message")}</p>
      <button
        onClick={onGoHome}
        className="mt-2 px-6 py-3 rounded-lg text-sm font-semibold border-0 cursor-pointer transition-all hover:brightness-110"
        style={{ background: "var(--l-blue)", color: "#fff" }}
      >
        {t("notFound.cta")}
      </button>
    </div>
  );
}
