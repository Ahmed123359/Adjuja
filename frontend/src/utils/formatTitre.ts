/**
 * Les portails MPE publient les titres d'AO soit en MAJUSCULES soit en
 * casse normale selon l'acheteur -- jamais de regle fixe. Convertir
 * inconditionnellement en minuscules abimerait les titres deja propres.
 * On ne reformate que les titres "qui crient" (forte proportion de
 * majuscules), via une casse de phrase simple (1ere lettre + apres chaque
 * point/!/?).
 */
function isShouting(text: string): boolean {
  const letters = text.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  if (letters.length < 12) return false;
  const upper = letters.replace(/[^A-ZÀ-Ý]/g, "");
  return upper.length / letters.length > 0.7;
}

function toSentenceCase(text: string): string {
  const lower = text.toLowerCase();
  return lower.replace(/(^\s*\w|[.!?]\s+\w)/g, (m) => m.toUpperCase());
}

export function formatTitre(titre: string): string {
  return isShouting(titre) ? toSentenceCase(titre) : titre;
}

/**
 * Les CPS marocains ajoutent souvent une clause de reservation entre
 * guillemets francais a la fin de l'objet (ex: "«Reserve a la TPE/PME...»").
 * On l'isole pour l'afficher comme une note distincte plutot que noyee
 * dans le titre.
 */
export function splitReservationClause(titre: string): { main: string; clause: string | null } {
  const match = titre.match(/«([^»]+)»\s*$/);
  if (!match) return { main: titre, clause: null };
  return {
    main: titre.slice(0, match.index).trim(),
    clause: match[1].trim(),
  };
}
