// Cache de données partagé -- 2026-09-25.
//
// Écrit parce que changer d'onglet rechargeait tout : `RightPanel` monte l'écran
// courant et démonte le précédent, donc chaque retour au tableau de bord
// relançait le résumé, le calendrier, la liste des AO, la veille et
// l'abonnement, et l'écran repassait par « Chargement… » alors que les données
// avaient été obtenues trois secondes plus tôt.
//
// Pas de bibliothèque : le projet n'a pas de socle de requêtes, et ce qu'il faut
// ici tient en une centaine de lignes.
//
// Trois comportements, et ce sont eux qui comptent :
//
//   1. **Lecture immédiate.** Une entrée encore fraîche est rendue au premier
//      rendu, sans état de chargement. C'est ce qui supprime le clignotement.
//   2. **Revalidation en fond** (stale-while-revalidate). Une entrée périmée est
//      quand même rendue tout de suite, et rafraîchie derrière : on voit
//      l'ancienne valeur, jamais un écran vide, et la nouvelle arrive sans
//      secousse.
//   3. **Déduplication.** Deux composants qui demandent la même clé en même
//      temps partagent UNE requête. La barre latérale et le tableau de bord
//      demandent le même calendrier ; sans cela, deux appels.
//
// L'invalidation est explicite après écriture : créer une tâche vide les clés de
// tâches et de tableau de bord. Un cache qui ne s'invalide pas montre des
// données fausses, ce qui est pire que de recharger.

import { useCallback, useEffect, useRef, useState } from 'react';

type Entree<T> = {
  data?: T;
  at: number;
  erreur?: Error;
  /** Requête en vol, partagée par tous les appelants de la même clé. */
  vol?: Promise<T>;
};

const cache = new Map<string, Entree<unknown>>();

/** Abonnés par clé : une écriture réveille tous les composants qui l'affichent,
 *  sans qu'aucun ait à re-demander. */
const abonnes = new Map<string, Set<() => void>>();

/** Durée par défaut avant qu'une entrée soit considérée périmée. Assez longue
 *  pour couvrir une navigation entre onglets, assez courte pour qu'une donnée
 *  modifiée ailleurs finisse par revenir. */
export const TTL_DEFAUT = 30_000;

function prevenir(cle: string): void {
  for (const f of abonnes.get(cle) ?? []) f();
}

/** Vide une clé exacte, ou toutes celles qui commencent par ce préfixe.
 *  Le préfixe sert aux familles : `invalider('tasks')` couvre `tasks:me`,
 *  `tasks:tous`, etc., qu'on ne peut pas énumérer depuis l'appelant. */
export function invalider(prefixe: string): void {
  for (const cle of [...cache.keys()]) {
    if (cle === prefixe || cle.startsWith(`${prefixe}:`)) {
      cache.delete(cle);
      prevenir(cle);
    }
  }
}

/** Vide tout. Appelé à la déconnexion : les données d'un compte ne doivent
 *  jamais survivre à la session de ce compte. */
export function viderCache(): void {
  const cles = [...cache.keys()];
  cache.clear();
  for (const c of cles) prevenir(c);
}

async function charger<T>(cle: string, source: () => Promise<T>): Promise<T> {
  const courante = cache.get(cle) as Entree<T> | undefined;
  // Une requête déjà en vol pour cette clé : on s'y raccroche.
  if (courante?.vol) return courante.vol;

  const vol = source()
    .then(data => {
      cache.set(cle, { data, at: Date.now() });
      prevenir(cle);
      return data;
    })
    .catch((e: unknown) => {
      const erreur = e instanceof Error ? e : new Error(String(e));
      // La donnée précédente est conservée : une panne réseau ne doit pas vider
      // un écran qui affichait quelque chose de correct.
      cache.set(cle, { ...(courante ?? { at: 0 }), erreur, at: courante?.at ?? 0 });
      prevenir(cle);
      throw erreur;
    });

  cache.set(cle, { ...(courante ?? { at: 0 }), vol });
  return vol;
}

export type Ressource<T> = {
  data: T | undefined;
  /** Vrai seulement quand il n'y a RIEN à montrer. Une revalidation en fond
   *  n'est pas un chargement : l'ancienne valeur reste affichée. */
  loading: boolean;
  erreur: Error | undefined;
  /** Recharge sans condition, en ignorant la fraîcheur. */
  refresh: () => void;
};

/**
 * Lit une ressource distante à travers le cache.
 *
 * `cle` identifie la donnée, pas le composant : deux écrans qui affichent la
 * même chose doivent employer la même clé, c'est ce qui les fait partager la
 * requête et le résultat.
 *
 * `source` est relue à chaque rendu mais n'est appelée que sur décision du
 * cache ; elle est donc gardée dans une ref pour ne pas relancer d'effet quand
 * l'appelant passe une lambda.
 */
export function useRessource<T>(
  cle: string | null,
  source: () => Promise<T>,
  ttl: number = TTL_DEFAUT,
): Ressource<T> {
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const [, forcer] = useState(0);
  const rendre = useCallback(() => forcer(n => n + 1), []);

  useEffect(() => {
    if (!cle) return;
    let vivant = true;

    const reveil = () => { if (vivant) rendre(); };
    const lot = abonnes.get(cle) ?? new Set();
    lot.add(reveil);
    abonnes.set(cle, lot);

    const entree = cache.get(cle) as Entree<T> | undefined;
    const perimee = !entree || Date.now() - entree.at > ttl;
    // Périmée ou absente : on charge. Présente et fraîche : rien à faire, le
    // rendu ci-dessous la sert déjà.
    if (perimee && !entree?.vol) {
      charger(cle, sourceRef.current).catch(() => { /* conservée dans l'entrée */ });
    }

    return () => {
      vivant = false;
      lot.delete(reveil);
      if (lot.size === 0) abonnes.delete(cle);
    };
  }, [cle, ttl, rendre]);

  const refresh = useCallback(() => {
    if (!cle) return;
    cache.delete(cle);
    charger(cle, sourceRef.current).catch(() => { /* conservée dans l'entrée */ });
  }, [cle]);

  const entree = cle ? (cache.get(cle) as Entree<T> | undefined) : undefined;

  return {
    data: entree?.data,
    loading: !!cle && entree?.data === undefined && entree?.erreur === undefined,
    erreur: entree?.erreur,
    refresh,
  };
}
