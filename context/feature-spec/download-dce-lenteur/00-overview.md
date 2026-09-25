## Deliverable

Réduire le temps entre "l'utilisateur clique favori" et "le DCE est
disponible en pièces classées" -- correction de perf, pas une nouvelle
fonctionnalité.

**Portée décidée le 2026-09-12 : backend ET frontend.** L'utilisateur a
tranché que le ressenti de lenteur vient des deux à la fois -- le temps réel
de téléchargement est trop long, ET le retour visuel pendant l'attente est
insuffisant. Les deux volets sont donc dans le scope, pas un choix de l'un
ou de l'autre selon ce que révèle la mesure. La mesure (étape 1 ci-dessous)
reste nécessaire, mais elle sert à savoir *quoi* optimiser côté backend, plus
à décider *si* le chantier est backend.

Côté frontend, le point de départ n'est pas zéro : `AoDetailPanel.tsx` /
`BdcDetailPanel.tsx` ont déjà un polling avec un état "téléchargement en
cours" (ajouté le 2026-08-17, borné à 15 tentatives pour l'état `noZipLink`,
voir `progress-tracker.md`). Ce qui manque est la granularité -- un état
binaire "en cours" sans progression ni étape courante ni ordre de grandeur
de durée. À confirmer en relisant le code réel de ces deux composants avant
d'écrire quoi que ce soit.

## Cause probable identifiée (à confirmer par mesure réelle avant de fixer)

`app/modules/ao_scraper/mpe.py::download_document` (ligne 398-439) :

```python
async def download_document(self, zip_url: str) -> tuple[bytes, str] | None:
    async with async_playwright() as pw:
        context = await self._get_context(pw)   # lance Chromium si self._browser is None
        ...
        await page.wait_for_load_state("networkidle", timeout=15000)
        ...
        async with page.expect_download(timeout=30000) as dl_info:
        ...
        finally:
            await page.close()
            await self._close()   # ferme et détruit le navigateur
```

Chaque appel (`download_ao_zip`, une tâche Celery par favori) instancie un
`MPEPlatformScraper` neuf, donc `self._browser` vaut toujours `None` au
départ -- **un cold-start Chromium complet à chaque téléchargement**, jamais
réutilisé entre deux favoris même rapprochés, plus un `wait_for_load_state("networkidle", timeout=15000)` qui peut consommer jusqu'à 15s pleines si la
page du portail ne devient jamais réellement idle (scripts de polling côté
site gouvernemental, hypothèse non confirmée). Le lancement du navigateur
(`_get_context`, ligne 107) et sa fermeture immédiate (`_close`, ligne 141)
à chaque tâche est structurellement coûteux, pas un bug au sens d'un
comportement incorrect -- juste jamais optimisé pour la fréquence réelle
d'usage (un favori = un cycle complet de navigateur).

## État au 2026-09-13

**Fait : l'attente `networkidle` est remplacée**, et elle était pire que
supposé. Observée en réel sur l'AO 599 (safakat) : elle ne ralentissait pas
seulement, elle **faisait échouer** le téléchargement dès qu'elle expirait
(3 échecs sur 4 tentatives, chacune de 27 à 83 s). `download_document` attend
désormais le bouton de téléchargement lui-même (45 s). Mesure réelle, en appelant
la méthode directement : **4 réussites sur 4**, 8 à 17 s par tentative (3 fois
l'AO 599, 1 AO marchespublics en non-régression). Le flux formulaire +
bouton décrit dans « Check » a donc été rejoué avec succès après le changement.

**Pas fait, le chantier reste ouvert :**
- la mesure **par étape** prévue à l'étape 1 (lancement du navigateur, goto,
  formulaire, téléchargement) : seule la durée totale a été mesurée. On ne sait
  donc toujours pas quelle part des 8 à 17 s restants revient au démarrage de
  Chromium ;
- la seconde piste backend, un **navigateur partagé** au niveau du worker plutôt
  qu'un cycle complet par tâche ;
- le **volet frontend** entier (étape courante affichée pendant l'attente).

## Mesure par étape faite le 2026-09-14

Script hors code de production, qui rejoue exactement le flux de
`download_document` dans le conteneur `ao-watcher-worker`. Deux passes par AO :
navigateur neuf, puis navigateur déjà lancé.

| Étape | marchespublics, AO 3389, 17,6 Mo | safakat, AO 599, 23,1 Mo |
|---|---|---|
| Lancement de Chromium | 1,0 s (5 %) | 0,5 s (4 %) |
| Page du formulaire | 5,0 s puis 3,7 s | 2,6 s puis 1,3 s |
| Remplissage + envoi | 2,1 s puis 1,7 s | 0,8 s puis 0,9 s |
| Attente du bouton | 2,1 s puis 1,8 s | 0,9 s puis 1,0 s |
| **Téléchargement du fichier** | **8,1 s (44 à 53 %)** | **7,9 s puis 6,3 s (61 à 66 %)** |
| **Total** | **18,6 s neuf, 15,3 s réutilisé** | **12,9 s neuf, 9,6 s réutilisé** |

**Conclusions :**
- Le démarrage de Chromium, l'hypothèse de départ de ce fichier, ne pèse que
  **4 à 5 %**. Réutiliser le navigateur fait gagner ~3 s, en partie seulement
  grâce au cache HTTP du portail. En face, le coût est lourd : le worker est en
  `prefork` et chaque tâche crée sa propre boucle asyncio (`asyncio.run`), alors
  qu'un navigateur Playwright est lié à sa boucle. **Piste déconseillée.**
- Environ la moitié du temps est le transfert du fichier depuis le portail :
  **hors de notre contrôle**.
- **Ce que l'utilisateur subit vraiment** vient d'ailleurs, d'après les logs du
  worker : un téléchargement réel a mis **~8 minutes** (10:40 à 10:48 le
  2026-09-13) à cause de 3 échecs relancés à 60 s d'intervalle ; une erreur
  permanente a été retentée 3 fois (~3 min) ; et côté écran, le polling s'arrête
  au bout de 45 s et une erreur temporaire s'affiche comme définitive (trois
  défauts déclarés dans `bugs-connus.md`). Le scrape AO planifié occupe aussi
  l'une des 2 places du worker pendant jusqu'à 5,5 min (328 s mesurées).

## Livré le 2026-09-14 (plan validé par l'utilisateur)

**Serveur (`adjuja-watcher`)**
- `app/core/download_progress.py` : étape courante en Redis (TTL 30 min),
  `set_step`/`clear` depuis les tâches, `mark_queued`/`read` depuis les routes.
  Temps écoulé et délai avant relance calculés côté serveur.
- `mpe.py::download_document` reçoit un `on_step` optionnel : `ouverture_portail`,
  `formulaire`, `preparation_dossier`, `reception_fichier`. La tâche ajoute
  `classement`, `refresh_and_download_ao_zip` ajoute `verification_lien`, les
  routes posent `en_file`.
- `download_ao_zip` et `download_bdc_document` : `PermanentDownloadError` (AO/BDC
  inexistant, aucun lien) échoue tout de suite sans relance ; une erreur
  temporaire n'est **plus écrite en base avant une relance**, seulement après la
  dernière, et l'étape `nouvelle_tentative` (n/4, délai) est exposée.
- `GET /aos/{id}` et `GET /bdc/{id}` renvoient `download_progress`. Remettre en
  favori efface l'ancienne `zip_error`.
- Au passage : `GET /bdc`, `/bdc/stats`, `/bdc/{id}` exigent désormais l'en-tête
  d'authentification, comme les routes AO.

**Écran (`features/veille`)**
- Nouveau `DownloadProgressBanner` (jetons `--l-warn*`, plus de hex), partagé par
  `AoDetailPanel` et `BdcDetailPanel`.
- Polling sans limite pendant un téléchargement (espacé à 10 s après 2 min) ;
  pour « aucun lien connu », suivi seulement le temps de la revérification.
- BDC sans document : message dédié au lieu d'un chargement infini.
- i18n fr + en (`veille.detail.downloadStep.*`, `downloadRetrying`,
  `downloadElapsed`, `bdc.detail.noDoc`).

**Vérifié en conditions réelles**
- AO 3389 mis en favori via l'API, interrogé chaque seconde comme l'écran :
  `en_file` → `ouverture_portail` → `formulaire` → `preparation_dossier` →
  `reception_fichier` → `classement` → fin à 23 s, 4 pièces classées.
- AO 5, avec une ancienne erreur posée exprès : erreur effacée à la mise en
  favori, `verification_lien` a trouvé un lien, **vrai échec du portail**
  (`Page.goto: Timeout 30000ms`), écran informé « tentative 1/4, relance dans
  59 s », 2e tentative réussie. Aucune erreur écrite en base pendant ce temps.
- Relances épuisées (portail simulé en échec sur l'AO 3412) : 4 tentatives,
  erreur écrite une seule fois, après la 4e. AO sans lien : échec immédiat, pas
  de relance.
- BDC 785 téléchargé et suivi ; `GET /bdc` et `/bdc/stats` sans en-tête → 401,
  avec → 200.
- `tsc --noEmit` et `npm run build` propres.
- Dernier ajustement (étape `ouverture_portail` signalée avant le démarrage de
  Playwright, qui laissait « en attente » affiché plusieurs secondes), vérifié le
  2026-09-15 après redémarrage du worker sur l'AO 4078 : `en_file` puis
  `ouverture_portail` dès t+1 s, fin à 16 s, 2 pièces classées.

**Non vérifié** : le rendu à l'écran dans un navigateur (aucun outil de capture
dans cette session), et le cas « BDC sans document » (aucun en base de dev).

**Piste abandonnée** : navigateur Chromium partagé entre tâches (voir la mesure
ci-dessus, gain ~3 s pour une refonte du worker).

## Depends on

Rien de nouveau architecturalement -- modification localisée à
`adjuja-watcher`, respecte l'invariant HTTP-only entre services
(`architecture-context.md`), ne touche aucun autre service.

## Build order

1. **Mesurer avant de corriger** (`ai-workflow-rules.md` : vérifier en réel,
   pas supposer) -- instrumenter `download_document` avec des logs de
   timing par étape (launch navigateur, goto, form fill,
   `wait_for_load_state`, `expect_download`) sur un vrai favori en
   conditions réelles, pour savoir laquelle des étapes domine avant de
   choisir le fix.
2. **Volet backend** -- selon le résultat de la mesure, candidats de fix (pas
   décidés à l'avance) :
   - Navigateur Chromium partagé au niveau du worker Celery (lancé une fois
     au démarrage du process worker, réutilisé entre tâches) plutôt qu'un
     cycle complet par tâche -- change la portée de `_get_context`/`_close`,
     qui devraient alors vivre au niveau du worker et non de chaque instance
     de scraper.
   - Remplacer `wait_for_load_state("networkidle")` par une attente plus
     ciblée (attendre l'apparition du bouton de téléchargement précis plutôt
     que l'absence de trafic réseau), si la mesure confirme que c'est le
     goulot.
3. **Volet frontend** -- rendre l'attente lisible : étape courante plutôt
   qu'un état binaire "en cours". Les étapes que la tâche traverse déjà
   réellement (revérification de la page de détail, remplissage du
   formulaire, téléchargement du zip, classement des pièces) existent côté
   backend ; les exposer demande un état de progression partagé -- le pattern
   est déjà en place sur ce projet (état Celery en Redis avec TTL 24h +
   polling frontend, utilisé par signature/paraphe/remplissage depuis le
   2026-07-05), donc à réutiliser plutôt qu'à réinventer.

## Check when the feature is done

- Temps mesuré entre clic favori et DCE disponible réduit, comparé à une
  mesure "avant" réelle sur le même AO ou un AO comparable -- pas juste "ça
  semble plus rapide".
- Le fix ne casse pas le flux confirmé fonctionnel le 2026-08-17 (formulaire
  Nom/Prénom/Email + CGU + bouton de téléchargement qui n'apparaît qu'après
  validation) -- retester ce flux complet après le changement.
- Pendant un vrai téléchargement, l'UI affiche l'étape réellement en cours et
  elle change au fil du traitement -- pas un libellé figé qui reste identique
  du premier au dernier instant.

## Open Questions

- Fréquence réelle des favoris par utilisateur (un cold-start Chromium de
  quelques secondes est-il vraiment le problème à l'échelle observée, ou le
  ressenti vient d'un cas particulier -- portail lent, gros DCE) : à
  objectiver par la mesure de l'étape 1 avant tout fix.
