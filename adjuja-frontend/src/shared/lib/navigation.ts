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

// Lien direct vers une fiche de la veille -- 2026-09-30.
//
// Les emails de veille pointent vers https://adjuja.com/app/veille/ao/<id>.
// L'application ne route pas ses onglets par URL : App lit le chemin au
// chargement, bascule sur la veille et met l'AO en attente ; VeillePage le
// consomme a son montage et ouvre la fiche. Si l'utilisateur n'est pas
// connecte, le chemin est garde le temps de la connexion (Google compris,
// meme onglet) puis rejoue.

const CHEMIN_FICHE_AO = /^\/app\/veille\/ao\/(\d+)\/?$/;
const CLE_APRES_CONNEXION = "adj:apres-connexion";
let aoEnAttente: number | null = null;

/** Identifiant de l'AO si le chemin est celui d'une fiche de la veille. */
export function aoDepuisChemin(chemin: string): number | null {
  const m = CHEMIN_FICHE_AO.exec(chemin);
  return m ? Number(m[1]) : null;
}

export function ouvrirAoVeille(id: number): void {
  aoEnAttente = id;
}

/** Rend l'AO en attente et l'efface (lu une seule fois). */
export function consommerAoVeille(): number | null {
  const id = aoEnAttente;
  aoEnAttente = null;
  return id;
}

/** Chemins internes qu'on peut rouvrir apres la connexion : l'application
 *  (/app/...) et l'administration (/admin, /admin/...). Jamais de redirection
 *  vers l'exterieur. */
const CHEMIN_INTERNE = /^\/(app\/[\w/-]*|admin(\/[\w/-]*)?)$/;

/** Garde un chemin interne pour apres la connexion. */
export function memoriserApresConnexion(chemin: string): void {
  if (!CHEMIN_INTERNE.test(chemin)) return;
  try { sessionStorage.setItem(CLE_APRES_CONNEXION, chemin); } catch { /* stockage bloque : on ira sur /app */ }
}

export function consommerApresConnexion(): string | null {
  try {
    const chemin = sessionStorage.getItem(CLE_APRES_CONNEXION);
    sessionStorage.removeItem(CLE_APRES_CONNEXION);
    return chemin && CHEMIN_INTERNE.test(chemin) ? chemin : null;
  } catch {
    return null;
  }
}
