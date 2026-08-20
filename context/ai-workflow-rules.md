# Règles de workflow IA

## Approche

ADJUJA est un projet existant, pas un chantier greenfield, développé en spec-driven
development : les fichiers de `context/` définissent quoi construire, comment, et l'état
réel d'avancement. Toujours implémenter contre ces specs, ne pas inventer de comportement
non défini ici ou dans `conception/`.

Fichiers de ce dossier et leur rôle :

- `project-overview.md` -- portée produit, objectifs, flux utilisateur, ce qui est dans
  et hors scope.
- `architecture-context.md` -- stack, limites de service, modèle de stockage/auth/
  sécurité, invariants. Référence condensée ; `conception/2. Architecture/architecture.md`
  reste la source technique complète.
- `code-standards.md` -- conventions de code condensées depuis `CLAUDE.md` (qui reste la
  source canonique), plus les patterns confirmés réels en cours d'implémentation.
- `ui-context.md` -- tokens de design, patterns rejetés, conventions de composants.
- `progress-tracker.md` -- trace vivante de l'état réel du système. Remplace `SUIVI.md`,
  resté figé à une session ancienne malgré l'instruction de `CLAUDE.md` de le tenir à
  jour -- preuve qu'un fichier qu'on "doit" mettre à jour sans discipline associée finit
  par pourrir.
- `feature-spec/<nom>/` -- un dossier par feature, voir "Structure des features"
  ci-dessous.

Ne pas dupliquer le contenu de ces fichiers ailleurs (CLAUDE.md, mémoire auto) : les lire
à chaque session plutôt que d'en garder une copie qui dérive.

## Structure des features

Le travail est planifié dans `feature-spec/<nom-feature>/`, un dossier par feature,
tranche verticale complète : `00-overview.md` (Deliverable / Depends on / Build order /
Check when the feature is done) puis, selon ce que la feature touche, `api.md`,
`client.md`. Une feature n'est pas terminée tant que chaque fichier de son dossier n'est
pas terminé -- le `00-overview.md` définit la vraie définition de "fait", pas un seul
fichier isolé.

Dans une feature, implémenter un fichier à la fois, dans l'ordre indiqué par son
`00-overview.md` (généralement `api.md` avant `client.md`, le frontend consommant ce que
le backend expose). `context/feature-spec/chatbot/` est l'exemple de référence actuel de
ce format.

Règles universelles (ce fichier, `code-standards.md`, `architecture-context.md`,
`ui-context.md`) ne sont jamais dupliquées à l'intérieur d'un dossier de feature -- une
feature ne contient que ce qui lui est spécifique (overview/api/client), jamais sa
propre copie des règles de travail ou des conventions de code.

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

- Architecture ou limites de service modifiées -> `architecture-context.md` (condensé) et
  `conception/2. Architecture/architecture.md` (détail complet)
- Item de roadmap terminé -> `conception/1.Roadmap/roadmap_technique.md` (`[ ]` -> `[x]`)
- Conventions de code changées -> `CLAUDE.md` (source canonique) et `code-standards.md`
  (condensé) ensemble, jamais l'un sans l'autre
- Tokens de design ou conventions UI changés -> `ui-context.md`
- Portée produit changée -> `project-overview.md`
- État d'avancement, décisions de session, bugs réels trouvés -> `progress-tracker.md`

Un changement d'architecture qui ne met à jour aucun de ces fichiers n'est pas terminé.
