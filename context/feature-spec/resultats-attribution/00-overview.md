## Deliverable

Scraping d'un troisième type de données depuis les portails MPE déjà couverts :
les **résultats d'attribution** publiés après clôture d'une consultation
(société adjudicataire, montant, liste des soumissionnaires et leurs montants,
statut retenu/non retenu). Préalable technique obligatoire à `concurrents/` et
au facteur "Références similaires" de `fit-score/` (comparer son propre
historique de soumissions).

## Vérifié en conditions réelles (2026-09-11)

Pas supposé : `https://www.marchespublics.gov.ma/bdc/entreprise/consultation/resultat`
est une page publique, sans authentification, contenant **317 939 résultats**
réels au moment de la vérification -- référence, objet, acheteur, date de
publication du résultat, nombre de plis reçus, société adjudicataire, montant
TTC. Le portail principal (pas seulement BDC) expose la même donnée via
`EntrepriseAdvancedSearch` avec un paramètre `AvisAttribution` (confirmé par
recherche, pas encore fetché en direct avec le vrai formulaire ASP.NET
postback -- voir Open Questions).

## Depends on

- `app/modules/ao_scraper/mpe.py::MPEPlatformScraper` -- même scraper
  config-driven que le listing/détail actuel (`scrapers/*.config.json`), pas
  un nouveau scraper à écrire. Un résultat d'attribution est un troisième mode
  de listing sur la même infra (comme `AllCons` pour les consultations en
  cours), donc une nouvelle entrée dans chaque `*.config.json` plutôt qu'un
  nouveau module Python.
- Nouvelle table `watcher.scraped_aos` ne convient pas (schéma différent :
  liste de soumissionnaires par lot, montants). Nouvelle table
  `watcher.award_results` + `watcher.award_bids` (un adjudicataire + N
  soumissionnaires par résultat), suit le pattern déjà en place pour
  `scraped_bdcs` (module parallèle, table séparée, même scraper).
- Aucun nouveau conteneur Docker, aucun nouveau service -- reste dans
  `adjuja-watcher`, respecte l'invariant "ao-watcher et notification-service
  ne partagent jamais de process Python, HTTP seule surface d'intégration"
  (`architecture-context.md`).

## Build order

1. `api.md` -- nouvelle entrée `listing_attribution` dans les 3
   `*.config.json`, migration table(s) `award_results`/`award_bids` (pas
   d'Alembic sur ao-watcher, `init_db.py` + `ALTER TABLE` documenté comme pour
   `mode_passation`), tâche Celery de scraping périodique (fréquence à
   définir -- probablement plus rare que le scraping des consultations en
   cours, le volume est massif : 317k+ lignes).
2. Pas de `client.md` dans ce chantier -- la donnée est consommée par
   `concurrents/` (nouvelle UI) et `fit-score/` (nouveau facteur), pas
   affichée directement ici.

## Check when the feature is done

- Une requête Playwright réelle contre `EntrepriseAdvancedSearch&AvisAttribution`
  (ou l'équivalent trouvé après vérification) retourne au moins un résultat
  réel avec adjudicataire + montant + liste de soumissionnaires, pas un mock.
- Les 317k+ résultats existants ne sont volontairement pas tous rescrapés
  d'un coup au premier run (voir Open Questions -- risque de ban/charge sur
  le portail gouvernemental, cooldown Redis existant sur les scrapers à
  réutiliser).
- Table(s) créées et vérifiées par requête SQL directe, pas seulement par un
  message de succès d'`init_db.py` (piège déjà rencontré 2 fois sur ce
  projet, voir `progress-tracker.md`).

## Open Questions

- Structure exacte du formulaire de résultats sur le portail principal
  (paramètre `AvisAttribution`) non vérifiée en conditions réelles avec
  Playwright -- seule la variante BDC a été confirmée avec de vraies données.
  Premier vrai test à faire avant d'écrire `api.md`.
- Stratégie de backfill vs scraping continu uniquement des nouveaux résultats
  à partir de maintenant -- 317k+ lignes historiques représentent une charge
  significative à re-scraper sur le portail gouvernemental, décision à
  prendre avec l'utilisateur (probablement : scraper en continu à partir
  d'aujourd'hui, backfill limité aux AO déjà en base côté `scraped_aos` pour
  matcher les références passées de l'org, pas tout l'historique public).
- Rapprochement `award_results` <-> `scraped_aos` existants (même
  `external_id`/référence ?) à confirmer -- certains résultats concernent des
  consultations jamais vues par notre scraper (clôturées avant qu'on
  commence à suivre ce portail).
