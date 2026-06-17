import { useState } from "react";
import { useTranslation } from "react-i18next";

function IconLinkedin() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.735-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function ColTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display m-0 mb-5 text-[15px] font-semibold text-l-text">
      {children}
    </p>
  );
}

function NavLink({ children }: { children: React.ReactNode }) {
  return (
    <a href="#" className="block mb-4 text-[15px] text-l-text-muted hover:text-l-text no-underline transition-colors">
      {children}
    </a>
  );
}

export default function LandingFooter({ onEnterApp }: { onEnterApp: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");

  const NAV_LINKS   = ["navHome", "navFeatures", "navPricing", "navBlog", "navContact"] as const;
  const LEGAL_LINKS = ["legalTerms", "legalPrivacy", "legalMentions", "legalSecurity", "legalRgpd"] as const;
  const CONTACT     = [
    { label: t("landing.footer.contactEmail"),   value: t("landing.footer.contactEmailValue") },
    { label: t("landing.footer.contactPhone"),   value: t("landing.footer.contactPhoneValue") },
    { label: t("landing.footer.contactAddress"), value: t("landing.footer.contactAddressValue") },
  ];

  return (
    <footer className="bg-[#050818] rounded-t-[32px] -mt-8">
      <div className="animate-on-scroll max-w-[1280px] mx-auto px-10 pt-20 pb-16">

        <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr_1fr_1fr_300px] gap-y-12 gap-x-10 xl:gap-x-16">

          {/* Logo — isolated left column */}
          <div className="flex flex-col gap-0">
            <img src="/logo-adjuja.png" alt="ADJUJA" className="h-8 w-auto object-contain object-left" />
          </div>

          {/* Navigation */}
          <div>
            <ColTitle>{t("landing.footer.navTitle")}</ColTitle>
            {NAV_LINKS.map(k => (
              <NavLink key={k}>{t(`landing.footer.${k}`)}</NavLink>
            ))}
          </div>

          {/* Légal */}
          <div>
            <ColTitle>{t("landing.footer.legalTitle")}</ColTitle>
            {LEGAL_LINKS.map(k => (
              <NavLink key={k}>{t(`landing.footer.${k}`)}</NavLink>
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

          {/* Newsletter — far right */}
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
                onChange={e => setEmail(e.target.value)}
                className="flex-1 min-w-0 bg-transparent px-4 py-3 text-[14px] text-l-text placeholder:text-l-text-dim outline-none border-0"
              />
              <button
                className="shrink-0 bg-l-blue border-0 cursor-pointer px-5 py-3 text-[14px] font-semibold text-white hover:brightness-110 transition-all"
              >
                {t("landing.footer.subscribe")}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.07]">
        <div className="max-w-[1280px] mx-auto px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="m-0 text-[14px] text-l-text-dim">
            {t("landing.footer.copyright")}
          </p>
          <div className="flex items-center gap-5">
            <a href="#" aria-label="LinkedIn" className="text-l-text-dim hover:text-l-text transition-colors">
              <IconLinkedin />
            </a>
            <a href="#" aria-label="X" className="text-l-text-dim hover:text-l-text transition-colors">
              <IconX />
            </a>
          </div>
        </div>
      </div>

    </footer>
  );
}
