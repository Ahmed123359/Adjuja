# UI Context

## Socle visuel (refonte du 2026-09-24 → 2026-09-26)

Refonte complète demandée par l'utilisateur : « oublie ce qui existe comme UI,
on repart de zéro ». La direction du 2026-09-16 (Inter + Plus Jakarta, cartes à
ombre douce, trait d'encre sous les titres) est **abandonnée**.

Source unique : `adjuja-frontend/src/shared/ui/tokens.css`.

### Tokens

Tout code neuf écrit `--adj-*`. Les anciens noms (`--sf-*`, `--tx-*`, `--ac-*`,
`--t-*`, `--r-*`, `--e-*`, `--s-*`) ne sont plus la source de rien : ils
survivent dans un bloc **pont** en bas de `tokens.css`, qui les recalcule depuis
les nouveaux. Ce pont existe pour les écrans non encore repris (veille, outils,
réglages, facturation), qui les portent en style inline -- les alimenter ainsi
les fait basculer sur la nouvelle identité sans les modifier. **Ne rien ajouter
au pont.** Quand un écran est repris, ses tokens deviennent des `--adj-*`.

| Rôle | Token | Valeur (clair) |
|---|---|---|
| Fond d'application | `--adj-bg` | `#F1F4FA` |
| Panneau | `--adj-panel` | `#FFFFFF` |
| Zone creuse | `--adj-panel-2` | `#EEF2F8` |
| Filet | `--adj-hairline` | `#E1E7F0` |
| Encre | `--adj-ink` → `--adj-ink-4` | `#111827` → `#8B97AD` |
| Marque | `--adj-brand` | `#2B79E8` |
| Rail (navigation) | `--adj-rail` | `#101529` |

Les neutres clairs sont **tirés du bleu nuit de marque `#080B1C`**, jamais d'un
gris quelconque et surtout pas d'un blanc chaud : un blanc cassé chaud a été
essayé le 2026-09-25 et jurait avec le rail et le bleu -- deux températures
opposées sur un même écran donnent un fond sale, pas un contraste.

### Typographie

**Manrope**, famille unique. Inter, Outfit, DM Sans, Plus Jakarta Sans et Sora
sont écartées (toutes essayées et rejetées pendant cette refonte).

Aucune taille sous **14px** : corps 16, libellés 15, méta 14, titres de panneau
20, titre d'écran 30, chiffres de mesure 44. Les capitales espacées à 10px sont
**interdites** -- ce tic de « console » a été explicitement rejeté.

### Formes

Rayons 8 / 12 / 14 (`--adj-round-s/m/l`). Ni les angles durs d'un terminal, ni
les galets.

**Fond uni (décision utilisateur du 2026-09-27).** Le fond de l'application a
la même couleur que les panneaux (`--adj-bg: var(--adj-panel)`, et côté
Tailwind `--background` = `--card`). Rien ne se détache par une différence de
fond ni par une ombre (`--adj-lift-1: none`) : les zones se séparent par des
**filets** (`--adj-hairline`), comme l'écran de veille (filtres | tableau). Cela
remplace le principe précédent, « un panneau blanc détouré par un fond gris ».
Les creux (`--adj-panel-2` : champs, pistes) et les surfaces flottantes (ombre
`--adj-lift-3`) gardent leur relief.

## Grille

**Grille de fractions à 8 colonnes**, `.adj-grid` + `.adj-1-8`, `.adj-1-4`,
`.adj-3-8`, `.adj-1-2`, `.adj-5-8`, `.adj-3-4`, `.adj-1-1`. Un panneau déclare
la fraction qu'il occupe ; il n'invente pas son propre `grid-template-columns`.
C'est ce qui manquait : chaque section avait sa grille, donc rien ne s'alignait
d'une rangée à l'autre.

**La fraction passe par une CLASSE, jamais par `style={{ gridColumn }}`.** Un
`gridColumn` inline l'emporte sur toute media query : les cartes gardaient leurs
4 colonnes sur un téléphone où la grille n'en a qu'une, et débordaient.

Paliers : 8 colonnes → 4 (≤1240px) → 2 (≤720px) → 1 (≤340px). Sur téléphone
seules les **mesures** (`.adj-kpi`) restent à deux de front ; tout panneau de
contenu prend la largeur entière, sinon son texte se brise à un mot par ligne.

## Responsive

Par **règles CSS**, pas par `useIsMobile()` quand c'est évitable : un test de
largeur en JavaScript ne sait rien avant le montage (la barre clignote au
chargement) et ignore le redimensionnement entre deux rendus. `useIsMobile()`
reste pour ce qui change de **structure** (le sélecteur tâches/discussion).

- `.adj-hide-md/sm/xs` masquent par ordre d'importance croissante. **Ne jamais
  masquer une fonction sans la reloger** : thème et langue avaient disparu de la
  barre du haut sur mobile, ce qui les supprimait purement et simplement.
- `.adj-label-sm` réduit un bouton à son icône.
- `.adj-toolbar` : les contrôles se replient sur une rangée. L'**action vient en
  premier** (`order: -1`), la recherche en dernier sur sa propre ligne
  (`.adj-toolbar-wide`).
- `html, body { overflow-x: hidden }`, et tout conteneur flex porte `minWidth: 0`
  -- sans lui un enfant large impose sa largeur et, centré par `margin: 0 auto`,
  déborde des deux côtés.

## Conventions

- Tout appel API passe par le `api.ts` du domaine, jamais `fetch()` dans un
  composant.
- Toute lecture partagée entre écrans passe par `useRessource` de
  `shared/lib/cache.ts`, avec une **clé commune** (`ao:list`, `org:members`,
  `dashboard:summary`) : c'est ce qui supprime le rechargement à chaque
  changement d'onglet et déduplique les requêtes. Toute écriture invalide.
- Toute copie par i18n (`locales/fr.json` / `en.json`). Vérifier qu'une clé
  existe **dans les deux** avant de la poser : une clé absente s'affiche telle
  quelle à l'écran.
- Contrôles de formulaire : `Select` et `DateField` du socle. Les natifs
  `<select>` et `<input type="date">` se rendent avec le style du système et
  ignorent le thème sombre.
- Une modale passe par `Modal` (verrou de défilement, piège à focus, retour du
  focus). Une surface flottante porte `.adj-pop`, son voile `.adj-overlay`.

## Rejeté, à ne plus proposer

Confirmé pendant cette refonte, souvent après essai :

- **Tuiles d'indicateur génériques** : pastille d'icône colorée + libellé en
  capitales + grand nombre + pastille de variation. Rejeté plusieurs fois.
- **Pourcentages de variation inventés** (« +12 % vs mois dernier ») : le
  produit ne conserve aucun historique par période pour les AO. Ce qui est
  affiché doit être vérifiable. *(Exception réelle :
  `ao_tasks.completed_at` existe, donc « tâches terminées par semaine » est une
  vraie donnée.)*
- **Barres de progression décoratives** : une part de 100 % sur un total de 1 ne
  dit rien ; « 650 nouveaux sur 657 » donnait une barre pleine qui n'exprimait
  rien.
- **Capitales espacées de 10px**, densité de console, texte sous 14px.
- **Blanc cassé chaud** comme fond d'application.
- Boutons en pilule, bandeau coloré contenant des boîtes blanches, contenu
  centré dans une largeur maximale laissant deux marges vides, salutation en
  en-tête **et** titre identique dans la barre du haut.
- **Liseré de couleur sur le bord gauche** d'un bandeau ou d'une carte (retiré du bandeau « Profil entreprise incomplet » le 2026-09-27, à la demande de l'utilisateur).
- **Deux entrées pour la même action** : « Nouvel AO » figurait à la fois dans
  la barre du haut et dans l'écran ; la bulle de discussion flottante doublait
  l'assistant d'étape.

## Retenu

- **Le titre de l'écran est dans la barre du haut**, pas répété dans la page.
- **Un libellé dit ce que le nombre compte** : « Tâches en retard », pas « En
  retard » ; « Dossiers en préparation », pas « AO en cours ». Sa lecture
  nomme le dénominateur (« sur 2 dossiers »).
- **Un titre se replie sur deux lignes, il ne se tronque pas.** « Entonnoir
  du… » ne dit pas ce que la carte montre.
- **Les échéances en relatif** (« dans 3 jours », « en retard de 6 jours ») à
  côté de la date.
- **Une réponse d'assistant produit quelque chose** (« en faire une tâche »,
  « copier ») plutôt que d'être un paragraphe à recopier.
- **Une erreur technique est traduite** en phrase actionnable, le texte brut
  restant sous un repli.
- **Un zéro reste lisible** : le griser jusqu'à `--adj-ink-4` le faisait passer
  pour un champ vide.

## Administration `/admin` (2026-10-01)

Page à part, pas un onglet (`features/admin/`, spec
`feature-spec/admin-panel/client.md`). Référence : un pupitre de poste
d'aiguillage, tout est calme, seul l'anormal s'allume.

- Une URL par écran, rail sombre groupé par thème (Pilotage, Clients, Veille,
  Sécurité) ; un écran répond à une question, on n'empile pas tout dans une
  page à défiler (reproche de l'utilisateur sur l'onglet du 2026-09-30).
- Gabarit unique `PageAdmin` + `Section` + tableaux de `components/ui.tsx` ;
  pleine largeur.
- Tableau de bord : « À surveiller » d'abord, puis registre ligné (libellé,
  chiffre, contexte), puis barres sur 30 jours. Jamais de tuiles
  d'indicateurs à pastille.
- Toute action qui change un compte passe par une `Modal` qui dit
  exactement ce qui va se produire ; une action impossible est remplacée par
  sa raison (« Vous », « Administrateur : non modifiable ici »), pas par un
  bouton grisé muet.

## Site public et écrans de connexion (2026-09-27)

Tokens `--l-*` sous `.landing-dark`, **forcé** sur toutes ces pages (accueil,
pages légales, authentification) : sans lui, les tokens suivent le thème
système et les champs passent en blanc sur fond sombre.

- Largeur de contenu 1320px, titres de section centrés, Manrope, textes ≥ 14px,
  liens et textes secondaires en couleur pleine `#C6D0E3` (le blanc à opacité
  réduite paraissait flou), boutons à 8px (jamais en pilule).
- Logo : `public/logo-adjuja-mark.png` (rogné) + mot-symbole « Adjuja » en
  Manrope 800. `logo-adjuja.png` a 44 % de marge transparente.
- Motifs d'identité réutilisables, dans `features/landing/components/` :
  `Orbites` (écho de la Terre et de la lune du héros), `BuyersMarquee`,
  `Cachet`. Les préférer à tout décor générique.
- Animations continues : ralenties, pas figées, sous `prefers-reduced-motion`
  (décision utilisateur) ; le survol met en pause.
- `background-clip: text` ne peint que dans la boîte de ligne : prévoir un
  retrait bas, sinon les jambages (« j ») disparaissent.
- Rejetés sur ce chantier : grille de fiches FAQ, accordéon, maquette de
  tableau de bord sous le héros, faux logos de partenaires, cartes flottantes
  inclinées, mise en page « documentation » pour les pages légales.

