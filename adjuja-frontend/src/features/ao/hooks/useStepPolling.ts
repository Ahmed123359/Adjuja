// Polling du parcours en mode accompagne.
//
// PIEGE TRAITE ICI, signale dans client.md : en mode accompagne, une etape qui
// finit met l'AO en attente d'une action humaine, qui peut durer des heures. Le
// polling de AoDetailView ne s'arrete que sur "termine"/"erreur" : tel quel, il
// tournerait indefiniment toutes les 12 secondes pendant tout ce temps.
//
// Ici il s'arrete des qu'aucune etape n'est en cours -- donc sur
// attente_validation -- et ne repart qu'apres une validation ou une relance.
// C'est la meme classe de bug que le polling non borne corrige le 2026-08-17.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAoSteps } from "../api";
import type { AoStep } from "../types";

/** Backoff identique a celui du mode express, pour un rythme coherent. */
const DELAYS = [3000, 5000, 8000, 12000];

/** Une etape tourne cote serveur : il y a une raison de continuer a interroger. */
function hasWorkInFlight(steps: AoStep[]): boolean {
  return steps.some((s) => s.statut === "en_cours");
}

export function useStepPolling(aoId: string, enabled: boolean) {
  const [steps, setSteps] = useState<AoStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    attemptRef.current = 0;
  }, []);

  /** Lit l'etat du parcours une fois. Retourne les etapes lues. */
  const refresh = useCallback(async (): Promise<AoStep[]> => {
    const fresh = await fetchAoSteps(aoId);
    setSteps(fresh);
    setError(null);
    return fresh;
  }, [aoId]);

  const schedule = useCallback(() => {
    const delay = DELAYS[Math.min(attemptRef.current, DELAYS.length - 1)];
    attemptRef.current += 1;

    timerRef.current = window.setTimeout(async () => {
      try {
        const fresh = await refresh();
        if (hasWorkInFlight(fresh)) {
          schedule();
        } else {
          // Plus rien ne tourne : on attend une action humaine, on arrete.
          stop();
        }
      } catch {
        // Erreur reseau ponctuelle : on retente, sans afficher d'erreur.
        schedule();
      }
    }, delay);
  }, [refresh, stop]);

  /** Relance le polling apres une action utilisateur (validation, rerun). */
  const resume = useCallback(
    (fresh: AoStep[]) => {
      setSteps(fresh);
      stop();
      if (hasWorkInFlight(fresh)) {
        attemptRef.current = 0;
        schedule();
      }
    },
    [schedule, stop],
  );

  // Chargement initial, puis polling seulement si une etape tourne.
  useEffect(() => {
    if (!enabled) {
      stop();
      setSteps([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchAoSteps(aoId)
      .then((fresh) => {
        if (cancelled) return;
        setSteps(fresh);
        if (hasWorkInFlight(fresh)) {
          attemptRef.current = 0;
          schedule();
        }
      })
      .catch(() => {
        if (!cancelled) setError("stepsLoadFailed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      stop();
    };
    // schedule/stop sont stables (useCallback), aoId et enabled pilotent le cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aoId, enabled]);

  return { steps, loading, error, refresh, resume, stop };
}
