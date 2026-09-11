## Deliverable

Chiffrement au repos des documents stockés (MinIO) et sauvegardes automatisées
régulières (PostgreSQL + MinIO), avec rotation et vérification de
restaurabilité -- pas juste un `pg_dump` qui tourne sans jamais être testé.

## État réel vérifié (2026-09-11)

Recherche dans `adjuja-infra` (compose, `.env.example`, README) : aucune
mention de chiffrement (SSE MinIO, `LUKS`, volumes chiffrés) ni de sauvegarde
automatisée (`pg_dump`, cron, service de backup) nulle part dans
l'infrastructure actuelle. Confirmé absent, pas juste non documenté.

## Depends on

Rien de fonctionnel -- chantier indépendant des 6 autres, peut démarrer à
n'importe quel moment sans attendre un autre chantier. Touche uniquement
`adjuja-infra` (compose, cron/service de backup) et la config MinIO/Postgres,
pas de nouvelle route API ni de nouveau composant frontend.

- MinIO supporte le chiffrement côté serveur (SSE-S3/SSE-KMS) nativement --
  probablement une variable d'environnement + une clé à provisionner plutôt
  qu'un développement applicatif. `MINIO_KMS_*` ou équivalent selon la
  version déployée (`minio/minio:latest` dans `docker-compose.dev.yml`,
  version fixée à vérifier côté prod).
- PostgreSQL : chiffrement au niveau volume (disque Hetzner chiffré) plus
  réaliste à court terme qu'un chiffrement colonne par colonne, qui casserait
  les invariants existants (timestamps `String` ISO 8601, recherche/index
  GIN sur `secteur_codes` etc.) -- à ne pas faire sans discussion explicite
  vu `architecture-context.md`'s invariant sur les conventions de colonnes
  existantes.
- Sauvegardes : nouveau service cron (`adjuja-infra`, probablement un
  conteneur dédié ou un job hôte) qui `pg_dump` + upload MinIO vers un stockage
  externe (pas le même MinIO qu'on sauvegarde -- sauvegarder vers soi-même ne
  protège de rien).

## Build order

Pas de découpage api.md/client.md classique -- ce chantier est infra pure.
Un seul document de travail suffira le moment venu (probablement
`infra.md` plutôt que `api.md`, à nommer quand on y arrive) :

1. Chiffrement au repos MinIO (SSE) -- activation + rotation de clé.
2. Chiffrement volume PostgreSQL (niveau disque, hors app).
3. Sauvegarde automatisée PostgreSQL (pg_dump régulier, rétention, stockage
   externe).
4. Sauvegarde automatisée MinIO (mirror vers un stockage externe).
5. Test de restauration réel (pas supposé fonctionnel parce que le dump
   existe) -- vérifie explicitement `ai-workflow-rules.md`'s discipline
   "vérifier en réel, pas supposer".

## Check when the feature is done

- Un objet MinIO uploadé après activation SSE est confirmé chiffré côté
  serveur (vérifiable via l'API MinIO, pas juste "l'option est activée").
- Une restauration complète (Postgres + MinIO) a été testée en réel sur un
  environnement séparé, pas seulement en supposant que le dump est valide.
- Les sauvegardes tournent sans intervention manuelle sur au moins un cycle
  complet observé (pas juste un script qui existe mais n'a jamais tourné).

## Open Questions

- Stockage externe cible pour les sauvegardes (S3 externe, autre VPS,
  Hetzner Storage Box...) -- pas choisi, dépend du budget/infra déjà en
  place côté utilisateur, hors de ce qui est visible dans le repo.
- Chiffrement colonne par colonne de données sensibles précises (ICE, RC,
  signature/cachet) en plus du chiffrement volume -- à discuter séparément
  si le chiffrement disque seul ne suffit pas au besoin réel de
  l'utilisateur (conformité, exigence contractuelle spécifique ?).
