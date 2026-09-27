import { useTranslation } from "react-i18next";

// Acheteurs dont les avis arrivent dans la veille : releve sur watcher.scraped_aos
// le 2026-09-27 (1 114 avis, 524 acheteurs distincts). Ce ne sont PAS des
// partenaires ni des clients : la legende le dit.
//
// Logos officiels recuperes sur Wikimedia Commons, ramenes a une silhouette
// blanche sur fond transparent (public/logos/acheteurs/) pour que des chartes
// heterogenes forment une seule rangee. `h` compense les formats : un sigle
// carre doit etre plus haut qu'un logotype en longueur pour peser pareil.
const ACHETEURS = [
  { id: "onee", nom: "Office national de l'électricité et de l'eau potable", h: 34 },
  { id: "oncf", nom: "Office national des chemins de fer", h: 44 },
  { id: "onda", nom: "Office national des aéroports", h: 54 },
  { id: "anp", nom: "Agence nationale des ports", h: 50 },
  { id: "onssa", nom: "Office national de sécurité sanitaire des produits alimentaires", h: 42 },
  { id: "onhym", nom: "Office national des hydrocarbures et des mines", h: 30 },
  { id: "adm", nom: "Autoroutes du Maroc", h: 40 },
  { id: "ofppt", nom: "Office de la formation professionnelle et de la promotion du travail", h: 50 },
  { id: "onp", nom: "Office national des pêches", h: 54 },
  { id: "map", nom: "Agence Maghreb Arabe Presse", h: 50 },
  { id: "tmsa", nom: "Tanger Med", h: 26 },
];

/** Legende + rangee de logos qui defile en continu (.l-marquee, index.css).
 *  Deux copies de la rangee ; la seconde est masquee aux lecteurs d'ecran.
 *  Utilisee au pied du heros et dans le panneau des pages de connexion. */
export default function BuyersMarquee({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const echelle = compact ? 0.8 : 1;
  return (
    <div>
      <p className="m-0 px-5 text-center text-[15px] font-medium text-white/70">
        {t("landing.hero.buyersCaption")}
      </p>
      <div className={`${compact ? "mt-5" : "mt-6"} overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]`}>
        <div className="l-marquee flex w-max">
          {[0, 1].map((copie) => (
            <ul
              key={copie}
              aria-hidden={copie === 1 || undefined}
              className={`m-0 flex list-none items-center p-0 ${compact ? "gap-12 pr-12" : "gap-16 pr-16"}`}
            >
              {ACHETEURS.map((a) => (
                <li key={a.id} className={`flex shrink-0 items-center ${compact ? "h-[46px]" : "h-[56px]"}`}>
                  <img
                    src={`/logos/acheteurs/${a.id}.png`}
                    alt={copie === 1 ? "" : a.nom}
                    title={a.nom}
                    loading="lazy"
                    draggable={false}
                    style={{ height: Math.round(a.h * echelle) }}
                    className="w-auto select-none opacity-60 transition-opacity duration-200 hover:opacity-100"
                  />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
