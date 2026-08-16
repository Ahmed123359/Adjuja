import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";


function ColTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display m-0 mb-5 text-[15px] font-semibold text-l-text">
      {children}
    </p>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="block mb-4 text-[15px] text-l-text-muted hover:text-l-text no-underline transition-colors">
      {children}
    </a>
  );
}

export default function LandingFooter({ onEnterApp }: { onEnterApp: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [subState, setSubState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "error" } | null>(null);

  async function handleSubscribe() {
    if (!email.trim()) return;
    setSubState("loading");
    try {
      const res = await fetch("/api/v1/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        setSubState("ok");
        setEmail("");
        showToast("Votre email a bien été enregistré, vous recevrez les prochaines alertes AO !", "ok");
      } else {
        setSubState("error");
        showToast("Adresse invalide ou déjà inscrite.", "error");
      }
    } catch {
      setSubState("error");
      showToast("Erreur réseau, réessayez.", "error");
    }
  }

  function showToast(msg: string, type: "ok" | "error") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const NAV_LINKS = [
    { key: "navHome",     href: "/" },
    { key: "navFeatures", href: "/#features" },
    { key: "navPricing",  href: "/#pricing" },
  ] as const;
  const CONTACT     = [
    { label: t("landing.footer.contactEmail"),   value: t("landing.footer.contactEmailValue") },
    { label: t("landing.footer.contactPhone"),   value: t("landing.footer.contactPhoneValue") },
    { label: t("landing.footer.contactAddress"), value: t("landing.footer.contactAddressValue") },
  ];

  return (
    <footer className="bg-[#050818] rounded-t-[32px] -mt-8">
      <div className="animate-on-scroll max-w-[1280px] mx-auto px-10 pt-20 pb-16">

        <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr_1fr_300px] gap-y-12 gap-x-10 xl:gap-x-16">

          {/* Logo  isolated left column */}
          <div className="flex flex-col gap-0">
            <img src="/logo-adjuja.png" alt="ADJUJA" className="h-14 w-auto object-contain object-left" />
          </div>

          {/* Navigation */}
          <div>
            <ColTitle>{t("landing.footer.navTitle")}</ColTitle>
            {NAV_LINKS.map(({ key, href }) => (
              <NavLink key={key} href={href}>{t(`landing.footer.${key}`)}</NavLink>
            ))}
          </div>

          {/* Contact */}
          <div>
            <ColTitle>{t("landing.footer.contactTitle")}</ColTitle>
            {CONTACT.map(c => (
              <div key={c.label} className="mb-5">
                <p className="m-0 mb-[3px] text-[12px] font-semibold text-l-text-dim uppercase tracking-[.08em]">
                  {c.label}
                </p>
                <p className="m-0 text-[15px] text-l-text-muted">{c.value}</p>
              </div>
            ))}
          </div>

          {/* Newsletter  far right */}
          <div>
            <ColTitle>{t("landing.footer.newsletterTitle")}</ColTitle>
            <p className="mt-0 mb-5 text-[14px] leading-[1.65] text-l-text-muted">
              {t("landing.footer.tagline")}
            </p>
            <div className="flex rounded-[var(--l-radius)] overflow-hidden bg-white/[0.05]">
              <input
                type="email"
                placeholder={t("landing.footer.emailPlaceholder")}
                value={email}
                onChange={e => { setEmail(e.target.value); setSubState("idle"); }}
                onKeyDown={e => e.key === "Enter" && handleSubscribe()}
                className="flex-1 min-w-0 bg-transparent px-4 py-3 text-[14px] text-l-text placeholder:text-l-text-dim outline-none border-0"
              />
              <button
                onClick={handleSubscribe}
                disabled={subState === "loading"}
                className="shrink-0 bg-l-blue border-0 cursor-pointer px-5 py-3 text-[14px] font-semibold text-white hover:brightness-110 transition-all disabled:opacity-60"
              >
                {subState === "loading" ? "..." : t("landing.footer.subscribe")}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.07]">
        <div className="max-w-[1280px] mx-auto px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-5">
            <p className="m-0 text-[14px] text-l-text-dim">
              {t("landing.footer.copyright")}
            </p>
            <div className="flex items-center gap-4">
              <Link to="/mentions-legales" className="text-[13px] text-l-text-dim hover:text-l-text no-underline transition-colors">
                {t("legal.mentions.title")}
              </Link>
              <Link to="/cgu" className="text-[13px] text-l-text-dim hover:text-l-text no-underline transition-colors">
                {t("legal.cgu.title")}
              </Link>
              <Link to="/confidentialite" className="text-[13px] text-l-text-dim hover:text-l-text no-underline transition-colors">
                {t("legal.confidentialite.title")}
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="https://continuum.ma"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 no-underline opacity-90 hover:opacity-100 transition-opacity"
            >
              <span className="text-[15px] font-medium text-l-text">Made by</span>
              <img src="/continuium-light.png" alt="Continuum" className="h-9 w-auto object-contain" />
            </a>
          </div>
        </div>
      </div>

      {/* Toast newsletter */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 28,
            right: 28,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 20px",
            borderRadius: 12,
            background: toast.type === "ok" ? "#0e2a24" : "#2a0e0e",
            border: `1px solid ${toast.type === "ok" ? "#1BC9A8" : "#e53e3e"}`,
            color: toast.type === "ok" ? "#1BC9A8" : "#fc8181",
            fontSize: 14,
            fontWeight: 500,
            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
            maxWidth: 360,
            animation: "slideInToast 0.3s ease",
          }}
        >
          <span style={{ fontSize: 18 }}>{toast.type === "ok" ? "✓" : "✕"}</span>
          {toast.msg}
        </div>
      )}
      <style>{`
        @keyframes slideInToast {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </footer>
  );
}
