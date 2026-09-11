## Deliverable

Trois briques liées par une même dépendance technique (positions de texte
dans le PDF), livrées ensemble parce qu'elles se recoupent, pas parce
qu'elles doivent être codées en une seule passe :

1. **Preview inline** pour tout document de l'app (CPS, RC, docs uploadés) --
   aujourd'hui absent : confirmé par recherche dans le frontend
   (`iframe`/`pdfUrl`/`preview`), aucun composant de preview PDF n'existe,
   les documents sont téléchargés, jamais affichés dans l'app.
2. **Cadrage/surlignage d'un passage** directement dans la preview (l'usage
   demandé : "édition de pdf, cadrer le passage"). **Décidé le 2026-09-12 :
   les annotations sont persistées en base**, pas un surlignage visuel
   éphémère -- l'utilisateur veut pouvoir les réutiliser ailleurs qu'à
   l'endroit où elles ont été créées. Une annotation est donc une donnée de
   première classe (document + page + bbox + texte du passage + auteur +
   date), pas un état d'UI. Jamais d'édition destructive du PDF source : le
   fichier d'origine dans MinIO reste intact, l'annotation vit à côté.
3. **Citations sourcées de l'IA** : quand l'assistant IA (chat existant ou le
   futur assistant de préparation d'AO) cite un passage du CPS/RC, la preview
   peut sauter au bon endroit et le surligner -- nécessite que l'OCR/
   l'extraction conserve la position (bounding box) de chaque passage, pas
   seulement le texte brut.

## Depends on

- `app/services/filler/filler_page_detector.py` -- détection de page déjà en
  place (PyMuPDF + fallback OCR Tesseract), mais **au niveau page, pas
  passage** (`detect_pages_in_text_pdf` retourne une liste de numéros de
  page). Ce chantier a besoin d'un niveau de granularité plus fin (bounding
  box par ligne/bloc de texte), que PyMuPDF donne nativement pour du texte
  numérique (`page.get_text("words")` / `search_for()`) et que Tesseract
  donne pour les pages scannées (`image_to_data`, pas juste
  `image_to_string` comme utilisé aujourd'hui dans l'extraction).
- `context/feature-spec/chatbot/` -- le pipeline RAG (`RagService`, Qdrant)
  existant récupère déjà des chunks de texte pour répondre aux questions.
  Ce chantier ajoute une métadonnée de position (page + bbox) à chaque chunk
  indexé pour les documents AO, pour pouvoir relier une citation à son
  emplacement visuel -- extension du payload Qdrant, pas un nouveau store.
- L'assistant IA de préparation d'AO (checklist, aide à comprendre l'offre,
  passages du CPS en justification) est un nouveau mode de conversation qui
  réutilise `ChatService`/`RagService` plutôt qu'un système séparé -- même
  pattern que le chatbot existant, contexte different (un AO précis au lieu
  de la réglementation générale). **Recoupe directement l'assistance IA par
  étape de `context/feature-spec/mode-accompagne/`** (ajouté le 2026-09-12,
  prioritaire sur ce chantier) : c'est le même assistant contextualisé sur un
  AO, à construire **une seule fois**. `mode-accompagne` passant en premier,
  ce chantier consomme ce qu'il aura posé au lieu de le refaire -- à vérifier
  dans le code réel au moment d'écrire `api.md`, pas à supposer.
- **Nouvelle table d'annotations** (app principale, migration Alembic) --
  conséquence directe de la décision de persistance ci-dessus. Portée à
  trancher en écrivant `api.md` : annotation rattachée à un document et
  visible par toute l'org (cohérent avec le modèle multi-tenant existant, les
  documents d'un AO appartiennent déjà à l'org) ou privée à son auteur. Les
  surfaces de réutilisation concrètes ("un autre lieu") restent à lister avec
  l'utilisateur au moment d'écrire `api.md` -- candidats évidents déductibles
  de l'existant : justification dans la fiche AO, reprise dans un document
  généré, contexte fourni à l'assistant IA.
- Frontend : nouveau composant `DocumentPreview.tsx` (viewer PDF avec overlay
  de surlignage), probablement `react-pdf` ou équivalent -- pas encore
  choisi, voir Open Questions.

## Build order

1. `api.md` -- extraction avec positions (PyMuPDF words + Tesseract
   `image_to_data` pour le fallback scanné), extension du payload RAG avec
   `page`/`bbox`, migration Alembic + CRUD de la table d'annotations, nouveau
   mode de chat "assistant AO" contextualisé sur un AO précis.
2. `client.md` -- viewer PDF + overlay de surlignage, nouveau composant chat
   contextualisé, lien clic-sur-citation -> saut + surlignage dans le viewer.

## Check when the feature is done

- Un CPS réel (texte numérique, pas scanné) s'affiche dans la preview sans
  téléchargement préalable.
- Une citation de l'IA (assistant AO ou chat) pointe vers une position réelle
  dans le document -- vérifié en cliquant la citation et en confirmant que le
  passage surligné correspond au texte réellement cité, pas une page
  approximative.
- Un CPS scanné (image, pas texte numérique) fonctionne aussi via le fallback
  OCR -- testé sur un vrai document scanné, pas seulement un PDF texte.
- Une annotation créée sur un document réel survit à un rechargement complet
  de la page et est relue depuis la base (vérifié par requête SQL directe, pas
  seulement parce que l'UI la réaffiche depuis son état local).

## Open Questions

- Librairie de rendu PDF côté frontend non choisie (`react-pdf`,
  `pdf.js` direct, autre) -- à trancher en écrivant `client.md`, pas ici.
- Coût du re-traitement OCR avec positions sur les documents déjà en base
  (CPS/RC déjà téléchargés avant ce chantier) : à la demande (première
  ouverture de la preview) ou backfill en tâche de fond -- pas tranché.
