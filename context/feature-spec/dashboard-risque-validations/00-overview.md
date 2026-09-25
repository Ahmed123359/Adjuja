# Tableau de bord : risque d'échéance et validations en attente

Ouvert le 2026-09-25, à la demande explicite de l'utilisateur : « on ne fait que
changer les couleurs, rien n'a été amélioré ». Constat partagé -- le tableau de
bord compte des objets (« 1 AO, 0 terminé ») au lieu de répondre aux questions
que se pose réellement quelqu'un qui répond à des marchés publics.

## Ce que le tableau de bord doit répondre

Dans l'ordre où la question se pose :

1. **Qu'est-ce qui est en danger ?** Un AO dont la date limite approche alors que
   le dossier n'avance pas. C'est le produit en une ligne, et rien ne l'affiche.
2. **Qu'est-ce qui est bloqué, et sur qui ?** En mode accompagné le parcours
   s'arrête à `attente_validation` tant qu'un humain ne valide pas.
3. **Qui porte quoi ?** La charge par membre.
4. **Qu'est-ce qui a changé depuis ma dernière visite ?**
5. **Quoi de neuf dans la veille qui mérite une action ?**

Ce document couvre **1 et 2**. Ils ne demandent aucune migration : toute la
donnée est déjà en base et n'est simplement pas lue. 3 est dérivable également.
4 et 5 demandent des tables neuves (voir « Ce qui manque en base »).

## Décisions

### La progression ne se mesure pas de la même façon dans les deux modes

Les deux modes sont utilisés en production (confirmé par l'utilisateur le
2026-09-25), et `appels_offres.pipeline_pct` ne veut pas dire la même chose dans
les deux :

- **express** : `pipeline_pct` est l'avancement de la chaîne Celery. C'est le
  seul signal disponible, et il est fidèle.
- **accompagné** : le parcours est fait de 7 étapes qu'un humain valide
  (`ao_pipeline_steps`). Un AO peut avoir un `pipeline_pct` élevé -- les tâches
  de fond ont tourné -- et rester bloqué depuis six jours sur une validation.
  La progression réelle est donc `validee / applicable`, pas `pipeline_pct`.

Prendre `pipeline_pct` pour les deux ferait passer pour sain exactement le cas
qu'on cherche à détecter. Le service calcule donc la progression **par mode**,
avec repli sur `pipeline_pct` si aucune ligne d'étape n'existe encore.

Étapes comptées pour le dénominateur : celles dont `applicable` n'est pas
`False`. `applicable = None` (redaction/remplissage avant l'analyse) compte comme
applicable : tant qu'on ne sait pas, on ne retire pas de travail du total.

### Le risque, c'est le temps consommé comparé au travail fait

Une date limite seule ne dit rien : un AO à rendre dans deux jours et terminé à
95 % va bien. Un AO à rendre dans deux jours et à 20 % est perdu. Le signal est
donc l'écart entre les deux -- l'utilisateur a tranché le 2026-09-25 : « pour le
risque mets les deux ».

```
fenetre   = date_limite - created_at        (durée totale dont on disposait)
ecoule    = maintenant  - created_at
temps     = ecoule / fenetre               0 -> 1
avance    = progression                    0 -> 1
marge     = avance - temps                 négatif = en retard sur le rythme
```

`marge` est une mesure, pas un score inventé : à -0,5 le dossier a consommé la
moitié de son temps de plus que ce qu'il a produit de travail.

### Niveaux

Le service renvoie un niveau, pas un flottant brut : c'est ce que l'écran trie
et colore, et ça évite que chaque client réinvente ses propres seuils.

| Niveau | Condition |
|---|---|
| `en_retard` | date limite dépassée, AO non terminé |
| `critique`  | `jours <= 2` et `avance < 0,9`, **ou** `marge <= -0,35` |
| `tendu`     | `jours <= 7` et `avance < 0,9`, **ou** `marge <= -0,15` |
| `ok`        | tout le reste -- **non renvoyé** |

Le plancher absolu (`jours <= 2`) existe parce que la marge seule rate l'AO créé
très en avance : sa fenêtre est large, donc son `temps` reste bas et sa marge
reste bonne jusqu'au dernier moment.

### Ce qui est exclu, et pourquoi c'est dit

- Statuts terminaux (`termine`, `abandonne`) : plus d'échéance à tenir.
- `erreur` : actionnable, mais ce n'est pas un risque d'échéance -- le statut le
  signale déjà. Le mélanger brouillerait la liste.
- **AO sans `date_limite`** : le risque n'est pas calculable. Ils ne sont pas
  silencieusement ignorés pour autant : la réponse porte un compteur
  `sans_echeance`. C'est un défaut réel et fréquent (la date limite était perdue
  à l'import avant la migration 014, voir `bugs-connus.md`), et le seul endroit
  où l'utilisateur peut s'en apercevoir est ici.

### Validations en attente

`ao_pipeline_steps.statut = 'attente_validation'`, joint aux AO de
l'organisation. Trié par `started_at` croissant : **la plus ancienne d'abord**,
parce que c'est celle qui bloque depuis le plus longtemps.

La table a été créée pour ça. Sa propre docstring (`db/models.py:322`) dit
qu'elle existe pour répondre « quels AO attendent une validation
(dashboard-collaboratif) » -- elle n'a jamais été branchée au tableau de bord.

**Limite assumée** : une étape n'a pas d'assigné, et l'organisation n'a pas de
rôles (`dashboard_routes.py:8`). On ne peut donc pas dire « en attente de *toi* »,
seulement « en attente ». C'est un argument de plus pour les rôles d'organisation,
pas un blocage ici.

## API

Deux routes en lecture seule, sous le routeur existant `/api/v1/dashboard`.

### `GET /dashboard/at-risk`

```
limit: int = 10 (1..50)

{
  "items": [{
    "ao_id", "reference", "objet", "acheteur",
    "date_limite", "jours_restants",          // négatif si dépassée
    "progression",                            // 0..100, calculée selon le mode
    "marge",                                  // -1..1, arrondie au centième
    "mode", "statut", "niveau",
    "etape_courante"                          // step_key bloquant, accompagné seulement
  }],
  "sans_echeance": 3                          // AO actifs sans date limite
}
```

Tri : `en_retard`, puis `critique`, puis `tendu` ; à niveau égal, `jours_restants`
croissant.

### `GET /dashboard/pending-validations`

```
limit: int = 10 (1..50)

{
  "items": [{
    "ao_id", "reference", "objet",
    "step_key", "step_order",
    "depuis",                                 // started_at ISO
    "jours_attente",
    "date_limite"                             // de l'AO, pour hiérarchiser
  }],
  "total": 4
}
```

## Coût

Deux requêtes pour `at-risk` (les AO actifs de l'org, puis leurs étapes en un
seul `IN`), une jointure pour `pending-validations`. Les index existent déjà :
`idx_ao_org_id`, `idx_aostep_ao_order`.

## Ce qui manque en base (hors périmètre de ce document)

Relevé en cherchant de quoi répondre aux questions 4 et 5 :

- **Aucun journal d'activité.** Pas de table d'audit. « Hafid a validé
  *Analyse* sur AO-14 », « Sara vous a assigné une tâche », « la veille a importé
  12 AO » : rien n'est enregistré, donc rien ne peut être affiché. C'est le plus
  gros manque d'un produit collaboratif.
- **Aucun commentaire ni mention** sur un AO ou une tâche. La collaboration se
  limite à une liste de cases à cocher, sans conversation. Les mentions sont
  aussi ce qui rendrait les notifications utiles.
- **Aucun état de lecture.** Rien ne retient « j'ai vu ça », donc aucun badge ne
  peut se vider et « nouveau depuis votre dernière visite » est impossible.
- **Pas de lien tâche -> étape.** `ao_tasks.ao_id` existe, mais pas l'étape que
  la tâche débloque : « cette tâche est ce qui retient l'étape 4 » n'est pas
  exprimable.
- **Pas de rôles d'organisation.** Donc pas de « en attente de validation
  managériale » : n'importe quel membre valide n'importe quoi.

## À corriger dans la documentation

`progress-tracker.md` et les échanges précédents affirment que le produit ne
conserve aucun historique par période, donc qu'aucune tendance n'est calculable.
C'est vrai des AO, **faux des tâches** : `ao_tasks.completed_at` est un
horodatage réel, « tâches terminées par semaine » est donc une vraie donnée et
non une invention.
