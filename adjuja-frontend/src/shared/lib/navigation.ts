// Ouvrir les reglages d'entreprise depuis n'importe quel ecran -- 2026-09-27.
//
// Le fit score propose des actions (« Completer mes references ») depuis des
// composants profonds (panneau de veille, etape Decision). Faire remonter un
// rappel jusqu'a App a travers tous leurs parents aurait touche une dizaine de
// signatures ; un evenement de fenetre suffit :
//   - App ecoute et bascule sur l'espace « entreprise » ;
//   - CompanySettingsPage lit la cible (onglet, champ) au montage ou a
//     l'evenement s'il est deja affiche ;
//   - ProfileTab defile jusqu'au champ une fois ses donnees chargees.

export type OngletReglages = "profile" | "signature" | "documents" | "equipe" | "generation";

export type CibleReglages = {
  onglet: OngletReglages;
  /** Identifiant de champ du profil (`certifications`, `ice`...), optionnel. */
  champ?: string | null;
};

const EVENEMENT = "adj:ouvrir-reglages";
let enAttente: CibleReglages | null = null;

export function ouvrirReglages(cible: CibleReglages): void {
  enAttente = cible;
  window.dispatchEvent(new CustomEvent<CibleReglages>(EVENEMENT, { detail: cible }));
}

/** Rend la cible en attente et l'efface (lue une seule fois). */
export function consommerCibleReglages(): CibleReglages | null {
  const c = enAttente;
  enAttente = null;
  return c;
}

export function surOuvertureReglages(fn: (cible: CibleReglages) => void): () => void {
  const ecoute = (e: Event) => fn((e as CustomEvent<CibleReglages>).detail);
  window.addEventListener(EVENEMENT, ecoute);
  return () => window.removeEventListener(EVENEMENT, ecoute);
}
