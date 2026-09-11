#!/usr/bin/env python3
"""
settings.py
-----------
Centralise toutes les constantes configurables du projet.
Aucune valeur codée en dur ne doit apparaître dans les autres modules.
Pour modifier le comportement du système, modifier uniquement ce fichier.
"""

# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

# URL de base de l'API Mistral (compatible OpenAI)
API_URL = "https://api.mistral.ai/v1/chat/completions"

# ---------------------------------------------------------------------------
# Modèles LLM
# ---------------------------------------------------------------------------

# Modèle utilisé pour les pipelines texte (PDF texte et DOCX)
TEXT_MODEL = "mistral-large-latest"

# Modèle vision utilisé pour les PDFs scannés (Pixtral)
VISION_MODEL = "pixtral-large-latest"

# ---------------------------------------------------------------------------
# Paramètres des appels LLM
# ---------------------------------------------------------------------------

# Température pour le LLM texte (faible = plus déterministe)
TEXT_LLM_TEMPERATURE = 0.1

# Timeout en secondes pour les appels au LLM texte
TEXT_LLM_TIMEOUT = 120

# Température pour Pixtral (très faible = lecture fidèle, peu d'invention)
VISION_LLM_TEMPERATURE = 0.05

# Nombre maximum de tokens dans la réponse Pixtral
# À augmenter si des documents longs sont tronqués
VISION_LLM_MAX_TOKENS = 8192

# Timeout en secondes pour les appels Pixtral (plus long car images lourdes)
VISION_LLM_TIMEOUT = 300

# ---------------------------------------------------------------------------
# Gestion du rate limiting (429)
# ---------------------------------------------------------------------------

# Nombre maximum de tentatives en cas de rate limit
RATE_LIMIT_MAX_RETRIES = 4

# Durée d'attente de base en secondes (multipliée par le numéro de tentative)
RATE_LIMIT_BASE_WAIT_SECONDS = 20

# ---------------------------------------------------------------------------
# Traitement des images (pipeline PDF scanné)
# ---------------------------------------------------------------------------

# Résolution de conversion PDF -> image en DPI
SCAN_DPI = 150

# Côté maximum d'une image en pixels avant envoi à l'API
IMAGE_MAX_SIDE_PX = 1200

# Qualité JPEG lors de la compression (0-95)
IMAGE_JPEG_QUALITY = 75

# ---------------------------------------------------------------------------
# Seuils de détection PDF scanné (is_scanned_pdf)
# ---------------------------------------------------------------------------

# Ratio minimum image/page pour considérer une page comme scannée
SCANNED_IMAGE_AREA_RATIO = 0.85

# Si le PDF contient moins de N caractères de texte -> scanné
SCANNED_MIN_TEXT_CHARS = 50

# Ratio maximum de caractères suspects (non alphanumériques standards)
SCANNED_MAX_SUSPICIOUS_RATIO = 0.12

# Ratio minimum d'espaces dans le texte
SCANNED_MIN_WHITESPACE_RATIO = 0.08

# Ratio minimum de mots lisibles (contenant des voyelles) parmi tous les mots
SCANNED_MIN_READABLE_WORD_RATIO = 0.45

# ---------------------------------------------------------------------------
# Reconstruction PDF (pipeline scanné)
# ---------------------------------------------------------------------------

# Police utilisée pour la reconstruction du PDF de sortie
RECONSTRUCTION_FONT = "Times-Roman"

# Dimensions de page A4 en points (1 pt = 1/72 pouce)
PAGE_WIDTH_PT = 595
PAGE_HEIGHT_PT = 842

# Marges en points
PAGE_MARGIN_X_PT = 56
PAGE_MARGIN_TOP_PT = 56
PAGE_MARGIN_BOT_PT = 56

# ---------------------------------------------------------------------------
# Détection du type de document (classification globale)
# ---------------------------------------------------------------------------

# Mots-clés associés à chaque type de document administratif.
# Utilisés par detect_document_type() pour scorer le texte extrait.
# Ajouter un nouveau type ici sans modifier le code de détection.
DOCUMENT_TYPE_KEYWORDS: dict[str, list[str]] = {
    "acte_engagement": [
        "acte d'engagement",
        "acte dengagement",
        "montant hors tva",
        "taux de la tva",
        "montant tva comprise",
        "partie reservee a l'administration",
        "partie réservée à l'administration",
        "soumissionnaire s'engage",
        "je soussigné m'engage",
    ],
    "declaration_honneur": [
        "declaration sur l'honneur",
        "déclaration sur l'honneur",
        "je soussigne",
        "je soussigné",
        "affilié à la cnss",
        "taxe professionnelle",
    ],
    "cahier_charges": [
        "cahier des prescriptions spéciales",
        "cahier des prescriptions speciales",
        "cahier des clauses administratives",
        "specifications techniques",
        "cahier des charges",
    ],
    "rc": [
        "règlement de consultation",
        "reglement de consultation",
        "rc ao",
        "conditions de participation",
        "modalités de sélection",
        "modalites de selection",
    ],
    "attestation_fiscale": [
        "attestation fiscale",
        "direction generale des impots",
        "regularite fiscale",
        "quitus fiscal",
    ],
    "bordereau_prix": [
        "detail estimatif",
        "détail estimatif",
        "désignation des prestations",
        "prix unitaire en dh",
        "prix total en chiffres",
        "quantité",
    ],
}

# ---------------------------------------------------------------------------
# Registre principal des documents
#
# Chaque entrée définit :
#   action        : "fill" | "extract_table" | "skip"
#                   fill          → remplissage LLM (Mistral texte ou Pixtral)
#                   extract_table → extraction de tableau vers Excel
#                   skip          → document ignoré (CPS, annexes techniques, etc.)
#   output_format : "pdf" | "docx" | "excel" | None
#   case_aware    : True si le document contient des sous-cas mutuellement exclusifs
#                   (personne physique, société, auto-entrepreneur, etc.)
#   lot_aware     : True si le document est associé à un lot numéroté
#
#   title_keywords : phrases recherchées dans l'en-tête de page (grands titres)
#   body_keywords  : phrases recherchées dans le corps de la page
#   max_pages      : nombre maximum de pages que ce document peut occuper
#   search_zone    : fraction de la hauteur de page à scanner pour la détection
#
# Pour ajouter un nouveau type de document : ajouter une entrée ici.
# Aucun changement de code nécessaire ailleurs.
# ---------------------------------------------------------------------------
DOCUMENT_REGISTRY: dict[str, dict] = {
    "acte_engagement": {
        "action":        "fill",
        "output_format": "pdf",
        "case_aware":    True,
        "lot_aware":     True,
        "title_keywords": [
            "ACTE D'ENGAGEMENT",
            "ACTE D ENGAGEMENT",
            "ANNEXE 1",
            "ANNEXE I",
            "MODELE DE L'ACTE",
        ],
        "body_keywords": [
            "montant hors tva",
            "taux de la tva",
            "montant tva comprise",
            "partie réservée à l'administration",
            "partie reservee a l'administration",
            "soumissionnaire s'engage",
            "je soussigné m'engage",
        ],
        "max_pages": 3,
        "search_zone": 0.30,
    },
    "declaration_honneur": {
        "action":        "fill",
        "output_format": "docx",
        "case_aware":    True,
        "lot_aware":     False,
        "title_keywords": [
            "DECLARATION SUR L'HONNEUR",
            "DECLARATION SUR L HONNEUR",
            "ANNEXE 2",
            "ANNEXE II",
        ],
        "body_keywords": [
            "je soussigne",
            "cnss",
            "taxe professionnelle",
            "registre du commerce",
            "identifiant commun",
        ],
        "max_pages": 5,
        "search_zone": 0.25,
    },
    "bordereau_prix": {
        "action":        "extract_table",
        "output_format": "excel",
        "case_aware":    False,
        "lot_aware":     True,
        "title_keywords": [
            # Phrases spécifiques à la page du tableau  absentes du corps des autres documents
            "BORDEREAU DES PRIX – DETAIL ESTIMATIF",
            "BORDEREAU DES PRIX - DETAIL ESTIMATIF",
            "BORDEREAU DES PRIX – DÉTAIL ESTIMATIF",
            "BORDEREAU DES PRIX - DÉTAIL ESTIMATIF",
            "ARTICLE 35. BORDEREAU",
        ],
        "body_keywords": [
            "désignation des prestations",
            "prix unitaire en dh",
            "prix total en chiffres",
        ],
        "max_pages": 5,
        "search_zone": 0.30,
    },
    "cahier_charges": {
        "action":        "skip",
        "output_format": None,
        "case_aware":    False,
        "lot_aware":     False,
        "title_keywords": [
            "CAHIER DES PRESCRIPTIONS",
            "CAHIER DES CLAUSES",
            "CPS",
            "CCA",
        ],
        "body_keywords": [
            "prescriptions speciales",
            "clauses administratives",
            "specifications techniques",
        ],
        "max_pages": 20,
        "search_zone": 0.20,
    },
    "rc": {
        "action":        "skip",
        "output_format": None,
        "case_aware":    False,
        "lot_aware":     False,
        "title_keywords": [
            "RÈGLEMENT DE CONSULTATION",
            "REGLEMENT DE CONSULTATION",
            "RC AO",
        ],
        "body_keywords": [
            "règlement de consultation",
            "reglement de consultation",
            "conditions de participation",
            "modalités de sélection",
        ],
        "max_pages": 40,
        "search_zone": 0.30,
    },
    "attestation_fiscale": {
        "action":        "skip",
        "output_format": None,
        "case_aware":    False,
        "lot_aware":     False,
        "title_keywords": [
            "ATTESTATION FISCALE",
            "REGULARITE FISCALE",
            "QUITUS FISCAL",
            "DIRECTION GENERALE DES IMPOTS",
        ],
        "body_keywords": [
            "regularite fiscale",
            "obligations fiscales",
            "impots",
        ],
        "max_pages": 1,
        "search_zone": 0.30,
    },
}

# ---------------------------------------------------------------------------
# Registre des cas (sous-sections mutuellement exclusives)
#
# Pour les documents avec case_aware=True, définit les variantes possibles.
#
# Champs par cas :
#   label          : nom lisible utilisé dans les logs et noms de fichiers
#   start_keywords : phrases marquant le début de ce cas dans le texte
#   end_keywords   : phrases marquant la fin de ce cas (= début du cas suivant)
#                    Liste vide = ce cas s'étend jusqu'à la fin du document
#
# Pour ajouter un nouveau cas : ajouter une entrée ici, aucun code à modifier.
# ---------------------------------------------------------------------------
CASE_REGISTRY: dict[str, dict[str, dict]] = {
    "acte_engagement": {
        # ----------------------------------------------------------------
        # Cas personne physique
        # Variantes de marqueurs selon le modèle de document :
        #   - "a) Pour les personnes physiques" (style a/b minuscule, RC AO)
        #   - "A - Pour les personnes physiques" (style A/B majuscule)
        #   - "1) Cas des personnes physiques" (style 1)/2)/3), CPS)
        # ----------------------------------------------------------------
        "personne_physique": {
            "label": "Personne physique (propre compte)",
            "start_keywords": [
                "a) Pour les personnes physiques",
                "A - Pour les personnes physiques",
                "A- Pour les personnes physiques",
                "1) Cas des personnes physiques agissant",
                "1) Cas des personnes physiques",
            ],
            "end_keywords": [
                "b) Pour les personnes morales",
                "B - Pour les personnes morales",
                "B- Pour les personnes morales",
                "2) Cas de l'auto-entrepreneur",
                "2) Cas de l auto-entrepreneur",
                "C - Partie réservée aux concurrents membres",
            ],
        },
        # ----------------------------------------------------------------
        # Cas auto-entrepreneur
        # ----------------------------------------------------------------
        "auto_entrepreneur": {
            "label": "Auto-entrepreneur",
            "start_keywords": [
                "2) Cas de l'auto-entrepreneur",
                "2) Cas de l auto-entrepreneur",
                "Cas de l'auto-entrepreneur",
            ],
            "end_keywords": [
                "b) Pour les personnes morales",
                "B - Pour les personnes morales",
                "B- Pour les personnes morales",
                "Pour les personnes morales",
                "C - Partie réservée aux concurrents membres",
            ],
        },
        # ----------------------------------------------------------------
        # Cas société / personne morale
        # end_keywords vide intentionnellement : inclut la section "D - Partie commune"
        # qui contient les montants financiers à remplir (Montant hors TVA, TVA, etc.)
        # La section "C - Partie réservée aux concurrents membres" est incluse mais
        # le LLM l'ignorera car les champs groupement ne correspondent pas aux données
        # entreprise individuelles du profil.
        # ----------------------------------------------------------------
        "societe": {
            "label": "Personne morale / Société",
            "start_keywords": [
                "b) Pour les personnes morales",
                "B - Pour les personnes morales",
                "B- Pour les personnes morales",
                "1) Cas des sociétés",
                "1) Cas des societes",
            ],
            # end_keywords vide : inclut D (montants financiers). C (groupements) est
            # masqué via skip_within_keywords ci-dessous.
            "end_keywords": [],
            # Section C (groupements) à masquer dans l'output d'une soumission individuelle.
            # Section D (partie commune, montants financiers) est conservée.
            "skip_within_keywords": [
                {
                    "start": [
                        "C - Partie réservée aux concurrents membres",
                        "c) Pour les concurrents membres",
                    ],
                    "end": [
                        "D - Partie commune",
                        "D- Partie commune",
                        "D - Partie réservée",
                    ],
                }
            ],
        },
        # ----------------------------------------------------------------
        # Cas établissement public
        # ----------------------------------------------------------------
        "etablissement_public": {
            "label": "Établissement public",
            "start_keywords": [
                "2) Cas des établissements publics",
                "2) Cas des etablissements publics",
            ],
            "end_keywords": [
                "3) Cas des coopératives",
                "3) Cas des cooperatives",
            ],
        },
        # ----------------------------------------------------------------
        # Cas coopérative  s'étend jusqu'à la fin du document
        # ----------------------------------------------------------------
        "cooperative": {
            "label": "Coopérative ou union de coopératives",
            "start_keywords": [
                "3) Cas des coopératives",
                "3) Cas des cooperatives",
                "Cas des coopératives ou union",
            ],
            "end_keywords": [],  # s'étend jusqu'à la fin du document
        },
        # ----------------------------------------------------------------
        # Cas groupement de concurrents (style a/b/c de la RC AO)
        # end_keywords vide : inclut la section D (montants financiers)
        # ----------------------------------------------------------------
        "groupement": {
            "label": "Groupement de concurrents",
            "start_keywords": [
                "C - Partie réservée aux concurrents membres",
                "c) Pour les concurrents membres",
            ],
            "end_keywords": [],  # s'étend jusqu'à la fin (inclut section D)
        },
    },
    "declaration_honneur": {
        "personne_physique": {
            "label": "Personne physique",
            "start_keywords": [
                "A - Pour les personnes physiques",
                "a) Pour les personnes physiques",
                "Pour les personnes physiques",
                "Je soussigné(e)",
                "Je soussigne",
            ],
            "end_keywords": [
                "Pour les personnes morales",
                "B - Pour les personnes morales",
                "b) Pour les personnes morales",
                "Pour les groupements",
            ],
        },
        "societe": {
            "label": "Personne morale / Société",
            "start_keywords": [
                "B - Pour les personnes morales",
                "b) Pour les personnes morales",
                "Pour les personnes morales",
                "Pour les groupements",
            ],
            "end_keywords": [],  # s'étend jusqu'à la fin
        },
    },
}

# ---------------------------------------------------------------------------
# Registre des lots
#
# Définit comment détecter et filtrer les lots numérotés dans un document.
# Utilisé par filler_segmenter et filler_table_extractor.
# ---------------------------------------------------------------------------
LOT_REGISTRY: dict = {
    # Regex pour détecter "Lot n°1", "Lot n°2", "Lot 1", etc.
    "lot_pattern": r"[Ll]ot\s*[nN]°?\s*(\d+)",

    # Nombre de blocs texte à scanner depuis le début pour trouver
    # une référence de lot dans l'en-tête d'un bloc tableau
    "lot_header_search_blocks": 5,
}

# ---------------------------------------------------------------------------
# Paramètres de détection de pages
# ---------------------------------------------------------------------------

# Score minimum pour qu'une page soit considérée comme appartenant au document
PAGE_DETECTION_MIN_SCORE = 1

# Poids appliqué aux title_keywords vs body_keywords dans le scoring
PAGE_TITLE_KEYWORD_WEIGHT = 2

# Nombre de pages à prendre en fallback (couche 3) si la détection échoue
FALLBACK_FIRST_N_PAGES = 5

# Résolution en DPI pour la conversion image lors de la détection d'en-têtes
DETECTION_LOW_DPI = 72

# Langue Tesseract pour la détection d'en-têtes
DETECTION_OCR_LANG = "fra+eng"

# Score minimum pour assigner une page à un type lors de la segmentation complète
# Valeur 3 : filtre les correspondances accidentelles (mots-clés apparaissant dans le corps
# d'un autre document) tout en conservant les vraies premières pages qui ont score ≥ 4-6.
SEGMENTATION_MIN_SCORE = 3

# ---------------------------------------------------------------------------
# Paramètres de sortie (orchestrateur)
# ---------------------------------------------------------------------------

# Suffixe du répertoire de sortie auto-généré
# Ex : "dossier_ao.pdf" → "dossier_ao_output/"
OUTPUT_DIR_SUFFIX = "_output"

# Nom de la feuille Excel par défaut pour les tableaux extraits
EXCEL_TABLE_SHEET_NAME = "Bordereau des Prix"

# Taille de police minimale pour considérer une cellule de tableau comme valide
TABLE_CELL_FONT_SIZE_MIN = 6.0
