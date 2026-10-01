# Suivi des soumissions, résultats et historique des entreprises

Demandé par l'utilisateur le 2026-10-01 : suivre chaque dossier déposé jusqu'au
résultat (admis au dossier administratif, à l'offre technique, écarté...),
**déduire le gagnant par la formule réglementaire** dès que les montants sont
connus, et afficher l'historique d'une entreprise (marchés gagnés, admissions,
écartements) comme le fait un concurrent (bidtndr).

## Ce qui est vérifié (pas supposé)

### Sources de l'information

- **Séance publique d'ouverture des plis** (décret 2-22-431, art. 42) : le
  président lit à haute voix la liste des admis et des écartés avec les
  motifs, puis ouvre les offres financières et lit les montants des actes
  d'engagement. L'entreprise présente connaît tout le jour même : c'est la
  source la plus rapide, et la seule que capte une **saisie** dans Adjuja.
- **Portail** (sondé le 2026-09-13, `feature-spec/resultats-attribution/`) :
  annonces « extrait de PV » (tous les soumissionnaires, admis, écartés,
  montants, retenu), « résultat définitif » (retenu seul), « rapport de
  présentation » (non sondé), toutes en **pièce jointe** (scans, Word, PDF
  texte) ; résultats des bons de commande lisibles dans la page (attributaire,
  montant). ~37 700 résultats AO sur 6 mois.
- **Données ouvertes** : recherche du 2026-10-01 sur data.gov.ma et les jeux
  publics (Apify, Hugging Face, articles) : **aucun** jeu ne contient les
  attributaires, soumissionnaires ou montants. bidtndr annonce lire « les
  résultats et procès-verbaux d'attribution » : même source que nous.

### Règle d'attribution (décret 2-22-431, BO 7184 du 6-4-2023)

Art. 43-II, offre économiquement la plus avantageuse :
- a) **travaux** et **services autres que les études** : la mieux-disante par
  rapport au prix de référence. Exception : **gardiennage, nettoyage des
  bâtiments administratifs, entretien des espaces verts** : le **taux de
  majoration le plus faible** appliqué à l'estimation (sous réserve de
  l'art. 20, §3, a) ;
- b) **fournitures** : la mieux-disante par rapport au prix de référence (le
  cas échéant avec le coût d'utilisation ou de maintenance, art. 21) ;
- c) **études** : la meilleure **note technico-financière** (art. 144, à lire
  avant de coder ce cas).

Art. 44, prix de référence :
- écarter d'abord les offres **excessives** (plus de 20 % au-dessus de
  l'estimation E, travaux / fournitures / services hors études) et
  **anormalement basses** (plus de 20 % en dessous pour les travaux, plus de
  25 % pour fournitures et services hors études) ;
- `P = (E + moyenne des offres financières restantes) / 2` ;
- la mieux-disante est l'offre **la plus proche de P par défaut** ; s'il n'y en
  a aucune sous P, la plus proche **par excès**.

Limite assumée : une offre « anormalement basse » n'est écartée qu'après
justification refusée par la commission ; le simulateur l'écarte d'office et
le dit (« écartée sauf justification acceptée »).

## Phases (build order)

1. **Suivi après dépôt + simulateur d'attribution** (aucune dépendance) :
   - panneau « Suivi du dépôt » sur le dossier, une fois déposé : dépôt,
     séance d'ouverture, dossier administratif (admis / écarté + motif), offre
     technique (admis / écarté, note), offres financières lues (nous et les
     concurrents), résultat (retenu, non retenu, infructueux, annulé,
     attributaire, montant) ;
   - **classement prévu** calculé à chaque saisie (fonction pure Python,
     testée sur des cas du décret) : offres écartées et pourquoi, prix de
     référence, mieux-disant prévu, notre rang et notre écart ;
   - estimation E pré-remplie depuis la veille (`budget_estime`) ou l'analyse ;
   - études (art. 144) : après lecture de l'article.
2. **Collecte des résultats publiés** (lot A de `resultats-attribution`) :
   annonces de résultat et d'extrait de PV avec leurs pièces jointes, résultats
   BDC ; **mesure de la profondeur d'historique** accessible.
3. **Lecture des PV** (OCR puis IA) : d'abord un échantillon de 50 pour
   mesurer coût et justesse, puis décision du périmètre (tous les résultats
   ou seulement les AO suivis).
4. **Historique et analytique par entreprise** : rapprochement des noms
   (normalisation + alias confirmés), fiche entreprise (participations, taux
   d'admission par phase, marchés gagnés, montants, acheteurs, concurrents
   fréquents, écart au gagnant) ; écran Concurrents (`feature-spec/concurrents/`).
5. **Raccordement** : un PV publié complète automatiquement le suivi du
   dossier correspondant (référence + acheteur) et signale les écarts avec la
   saisie.

## Modèle de données, phase 1 (migration 020, à valider)

Additif, deux tables neuves ; `llm_usage` passe en 021.

- `ao_suivi` (une ligne par dossier) : `ao_id` (PK, FK `appels_offres`, suppression
  en cascade), `nature_marche` (`travaux`, `fournitures`, `services`, `etudes`,
  `gardiennage_nettoyage`), `estimation_mad`, `date_depot`, `date_ouverture`,
  `statut_administratif`, `motif_administratif`, `statut_technique`,
  `note_technique`, `statut_final` (`en_attente`, `retenu`, `non_retenu`,
  `infructueux`, `annule`), `attributaire`, `montant_attribue`, `source`
  (`saisie`, `pv`), `updated_at`, `updated_by`.
- `ao_offres_concurrentes` (une ligne par soumissionnaire) : `id`, `ao_id`,
  `nom`, `est_nous`, `montant_lu`, `montant_corrige`, `statut` (`admis`,
  `ecarte_administratif`, `ecarte_technique`), `motif`, `note_technique`,
  `ordre`.

Montants en `NUMERIC(15,2)`, dates en chaînes ISO (convention des tables
existantes). Accès : membres de l'organisation du dossier (`org_id or id`).

## Check when the feature is done (phase 1)

- Sur un cas tiré du décret (E, 5 offres dont une excessive et une
  anormalement basse), le classement prévu correspond au calcul fait à la main.
- Aucune offre sous P : la plus proche par excès est désignée.
- Gardiennage : le taux de majoration le plus faible l'emporte.
- Un membre d'une autre organisation reçoit 404 sur le suivi d'un dossier.

## Open Questions

- Périmètre de lecture des PV (tous ou seulement les AO suivis) et profondeur
  d'historique : tranchés en phase 2 et 3, sur mesures réelles.
- Art. 144 (études) : formule exacte de la note technico-financière à lire.
