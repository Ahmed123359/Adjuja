import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const FOOTER_CSS = `
.footer-grid { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1.4fr; gap: 48px; }
.footer-bottom { display: flex; align-items: center; justify-content: space-between; }
@media (max-width: 900px) { .footer-grid { grid-template-columns: 1fr 1fr; gap: 36px; } }
@media (max-width: 560px) {
  .footer-grid { grid-template-columns: 1fr; gap: 28px; }
  .footer-bottom { flex-direction: column; gap: 16px; text-align: center; }
}
`;

function IconLinkedin() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>;
}
function IconTwitter() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.735-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>;
}

export default function LandingFooter({ onEnterApp }: { onEnterApp: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");

  useEffect(() => {
    const id = "footer-css";
    let s = document.getElementById(id) as HTMLStyleElement | null;
    if (!s) { s = document.createElement("style"); s.id = id; document.head.appendChild(s); }
    s.textContent = FOOTER_CSS;
  }, []);

  const NAV_LINKS   = ["navHome","navFeatures","navPricing","navBlog","navContact"] as const;
  const LEGAL_LINKS = ["legalTerms","legalPrivacy","legalMentions","legalSecurity","legalRgpd"] as const;
  const CONTACT     = [
    { label: t("landing.footer.contactEmail"),   value: t("landing.footer.contactEmailValue")   },
    { label: t("landing.footer.contactPhone"),   value: t("landing.footer.contactPhoneValue")   },
    { label: t("landing.footer.contactAddress"), value: t("landing.footer.contactAddressValue") },
  ];

  return (
    <div style={{ background: "var(--l-footer-bg)", fontFamily: "inherit" }}>

      {/* CTA card */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 80px" }}>
        <div style={{ background: "var(--l-cta-bg)", border: "1px solid var(--l-card-border)", borderRadius: 20, padding: "64px 40px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "radial-gradient(circle, var(--l-blue-a) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
          <div style={{ position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)", width: 500, height: 200, background: "radial-gradient(ellipse, var(--l-blue-glow) 0%, transparent 70%)", filter: "blur(40px)", pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em", color: "var(--l-text)", margin: "0 0 16px" }}>
              {t("landing.cta.title")}
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--l-sub)", margin: "0 auto 32px", maxWidth: 440 }}>
              {t("landing.cta.subtitle")}
            </p>
            <button onClick={onEnterApp} style={{ background: "var(--l-blue)", border: "none", cursor: "pointer", padding: "13px 36px", borderRadius: 10, fontSize: 15, fontWeight: 600, color: "#fff", fontFamily: "inherit", transition: "opacity .15s", marginBottom: 28 }}
              onMouseEnter={e => e.currentTarget.style.opacity = ".82"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >{t("landing.cta.button")}</button>
            <div style={{ display: "flex", justifyContent: "center", gap: 28, flexWrap: "wrap" }}>
              {(["bullet1","bullet2","bullet3"] as const).map(k => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-5" stroke="var(--l-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span style={{ fontSize: 13, color: "var(--l-sub)" }}>{t(`landing.cta.${k}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer body */}
      <div style={{ borderTop: "1px solid var(--l-card-border)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 24px 48px" }}>
          <div className="footer-grid">

            {/* Brand */}
            <div>
              <img src="/logo-adjuja.png" alt="ADJUJA" style={{ height: 24, marginBottom: 14 }} />
              <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--l-sub)", margin: "0 0 24px", maxWidth: 240 }}>{t("landing.footer.tagline")}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="email" placeholder={t("landing.footer.emailPlaceholder")} value={email} onChange={e => setEmail(e.target.value)}
                  style={{ flex: 1, background: "var(--l-input-bg)", border: "1px solid var(--l-card-border)", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "var(--l-text)", fontFamily: "inherit", outline: "none", minWidth: 0 }}
                />
                <button style={{ background: "var(--l-blue)", border: "none", cursor: "pointer", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, color: "#fff", fontFamily: "inherit", transition: "opacity .15s", whiteSpace: "nowrap" }}
                  onMouseEnter={e => e.currentTarget.style.opacity = ".82"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >{t("landing.footer.subscribe")}</button>
              </div>
            </div>

            {/* Navigation */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--l-text)", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 18px" }}>{t("landing.footer.navTitle")}</p>
              {NAV_LINKS.map(k => (
                <a key={k} href="#" style={{ display: "block", fontSize: 14, color: "var(--l-sub)", textDecoration: "none", marginBottom: 12, transition: "color .15s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--l-text)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--l-sub)"}
                >{t(`landing.footer.${k}`)}</a>
              ))}
            </div>

            {/* Legal */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--l-text)", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 18px" }}>{t("landing.footer.legalTitle")}</p>
              {LEGAL_LINKS.map(k => (
                <a key={k} href="#" style={{ display: "block", fontSize: 14, color: "var(--l-sub)", textDecoration: "none", marginBottom: 12, transition: "color .15s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--l-text)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--l-sub)"}
                >{t(`landing.footer.${k}`)}</a>
              ))}
            </div>

            {/* Contact */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--l-text)", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 18px" }}>{t("landing.footer.contactTitle")}</p>
              {CONTACT.map(c => (
                <div key={c.label} style={{ marginBottom: 14 }}>
                  <span style={{ fontSize: 12, color: "var(--l-dim)", fontWeight: 600 }}>{c.label} </span>
                  <span style={{ fontSize: 14, color: "var(--l-sub)" }}>{c.value}</span>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: "1px solid var(--l-card-border)" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px" }}>
            <div className="footer-bottom">
              <p style={{ margin: 0, fontSize: 13, color: "var(--l-dim)" }}>
                <strong style={{ color: "var(--l-sub)" }}>{t("landing.footer.copyright")}</strong>
              </p>
              <div style={{ display: "flex", gap: 14 }}>
                {[{ icon: <IconLinkedin /> }, { icon: <IconTwitter /> }].map((s, i) => (
                  <a key={i} href="#" style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--l-input-bg)", border: "1px solid var(--l-card-border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--l-sub)", textDecoration: "none", transition: "color .15s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--l-text)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--l-sub)"}
                  >{s.icon}</a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
