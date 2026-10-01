// Montants du suivi : saisie libre à la française, échange en chaîne décimale.
//
// Le serveur renvoie des Decimal en chaîne (« 983333.33 ») et attend la même
// forme. Une saisie « 1 250 000,50 » ou « 1.250.000,50 » doit donc être
// ramenée à « 1250000.50 » ; une saisie illisible donne null, jamais NaN.

export function lireMontant(saisie: string): string | null {
  const brut = saisie.replace(/[\s  ]/g, '').replace(/(MAD|DH|DHS)$/i, '');
  if (!brut) return null;
  // Virgule décimale française ; points comme séparateurs de milliers.
  const normalise = brut.includes(',') ? brut.replace(/\./g, '').replace(',', '.') : brut;
  if (!/^\d+(\.\d{1,2})?$/.test(normalise)) return null;
  return normalise;
}

export function afficherMontant(valeur: string | null, locale: string): string {
  if (valeur === null || valeur === '') return '';
  const n = Number(valeur);
  if (Number.isNaN(n)) return valeur;
  return n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Nombre court pour une note ou un pourcentage (« 89,5 », « -3,39 »). */
export function afficherNombre(valeur: string | null, locale: string): string {
  if (valeur === null) return '';
  const n = Number(valeur);
  return Number.isNaN(n) ? valeur : n.toLocaleString(locale, { maximumFractionDigits: 2 });
}
