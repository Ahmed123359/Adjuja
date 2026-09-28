// Gravite des risques : libelles et styles, definis a un seul endroit.
// Spec : context/feature-spec/analyse-ao-enrichie/client.md.
//
// Quatre niveaux exprimes par l'intensite des trois couleurs d'etat du socle,
// sans nouvelle couleur. La gravite vient toujours du serveur (calculee en
// Python a partir de la probabilite et de l'impact) : rien ici ne la recalcule.

import type { Gravite, Impact, Probabilite } from "../../types";

export const GRAVITES: Gravite[] = ["critique", "elevee", "moderee", "faible"];
/** Lignes de la matrice : forte en haut. */
export const PROBABILITES: Probabilite[] = ["forte", "moyenne", "faible"];
/** Colonnes de la matrice : faible a gauche. */
export const IMPACTS: Impact[] = ["faible", "moyen", "fort"];

export const STYLE_GRAVITE: Record<Gravite, { fond: string; texte: string }> = {
  critique: { fond: "var(--adj-neg)", texte: "#FFFFFF" },
  elevee:   { fond: "var(--adj-neg-tint)", texte: "var(--adj-neg)" },
  moderee:  { fond: "var(--adj-hold-tint)", texte: "var(--adj-hold)" },
  faible:   { fond: "var(--adj-panel-2)", texte: "var(--adj-ink-2)" },
};

// Meme grille que le serveur (analyse_enrichissement.py) : sert uniquement a
// colorer une CASE VIDE de la matrice, qui n'a pas de risque pour porter sa
// gravite. Une case pleine prend la gravite de ses risques.
const GRAVITE_CASE: Record<Probabilite, Record<Impact, Gravite>> = {
  forte:   { faible: "moderee", moyen: "elevee", fort: "critique" },
  moyenne: { faible: "faible", moyen: "moderee", fort: "elevee" },
  faible:  { faible: "faible", moyen: "faible", fort: "moderee" },
};

export function graviteCase(p: Probabilite, i: Impact): Gravite {
  return GRAVITE_CASE[p][i];
}
