# Règles de workflow IA

## Approche

ADJUJA est un projet existant, pas un chantier greenfield. Ce fichier ne remplace pas
`CLAUDE.md` (conventions de code, sécurité) ni `conception/2. Architecture/architecture.md`
(architecture technique) ni `conception/1.Roadmap/roadmap_technique.md` (roadmap) : il
ajoute la discipline manquante entre les deux -- comment travailler session après session
sans perdre le fil, et comment garder une trace fiable de l'état réel du système.

`progress-tracker.md` (même dossier) est la trace vivante. Il remplace `SUIVI.md`, resté
figé à une session ancienne malgré l'instruction de `CLAUDE.md` de le tenir à jour --
preuve qu'un fichier qu'on "doit" mettre à jour sans discipline associée finit par pourrir.

## Discipline de mise à jour

`progress-tracker.md` doit refléter l'état réel du système, jamais l'état visé. Mettre à
jour immédiatement après tout changement significatif, pas en fin de session sur mémoire :

- Section **Complété** : ce qui a été fait, avec assez de détail pour comprendre le
  "pourquoi" sans relire tout le diff (fichiers touchés, bug réel rencontré + cause + fix,
  décision prise et raison). Pas un changelog de commits, une trace de raisonnement.
- Section **En cours** : ce qui est commencé mais pas fini, avec l'état exact où ça s'est
  arrêté.
- Section **Questions ouvertes** : tout ce qui reste ambigu, non vérifié, ou décidé
  provisoirement (config à confirmer, comportement supposé mais jamais testé en réel).
- Ne jamais laisser une question ouverte se perdre silencieusement : si elle est résolue,
  la retirer et documenter la décision dans la section pertinente.

## Vérifier en réel, pas supposer

Ce projet a un historique concret de bugs qui n'existaient QUE parce que le code n'avait
jamais tourné en conditions réelles (`init_db.py` "réussi" en prod sans créer les tables,
bucket MinIO jamais créé côté ao-watcher, `SignatureDoesNotMatch` invisible en dev). La
discipline qui en découle :

- Un changement touchant un service Docker n'est pas considéré fait tant qu'il n'a pas été
  vérifié via les logs réels du container (`docker compose logs <service> --tail=N`) ou un
  appel réel (`curl`, requête SQL directe).
- Ne jamais assumer qu'un script d'init (`init_db.py`, migrations) a fonctionné parce qu'il
  a affiché un message de succès -- vérifier la table/donnée réellement créée.
- Quand un correctif ne prend pas effet, l'hypothèse par défaut est que le code est faux,
  pas qu'il faut redémarrer un service ou vider un cache. Relire le fichier réel avant de
  proposer autre chose.

## Portée du travail

- Un changement qui touche plusieurs microservices à la fois (ex: `ao-watcher` +
  `notification-service` + frontend) doit être scindé en étapes vérifiables séparément,
  sauf si les trois sont strictement nécessaires pour qu'un seul comportement observable
  fonctionne.
- Ne pas inventer de comportement produit non défini dans `conception/` ou demandé
  explicitement. Si un point est ambigu, le documenter dans `progress-tracker.md` sous
  Questions ouvertes plutôt que de deviner silencieusement.

## Pas de subagents

Ne jamais utiliser l'outil Agent sur ce projet (règle déjà en mémoire, rappelée ici car
`ai-workflow-rules.md` est le fichier que ce genre de règle doit habiter à long terme).
Tout le travail se fait directement dans la session courante, qui a déjà le contexte complet.

## Garder les docs à jour

- Architecture ou limites de service modifiées -> `conception/2. Architecture/architecture.md`
- Item de roadmap terminé -> `conception/1.Roadmap/roadmap_technique.md` (`[ ]` -> `[x]`)
- Conventions de code changées -> `CLAUDE.md`
- État d'avancement, décisions de session, bugs réels trouvés -> `progress-tracker.md`

Un changement d'architecture qui ne met à jour aucun de ces fichiers n'est pas terminé.
