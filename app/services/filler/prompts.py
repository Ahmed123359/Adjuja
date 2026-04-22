#!/usr/bin/env python3
"""
prompts.py
----------
Centralise tous les prompts envoyés aux modèles LLM.

Prompts disponibles :
    TEXT_SYSTEM_PROMPT              : pipeline PDF texte + DOCX (Mistral texte)
    get_vision_prompt(doc_type)     : pipeline PDF scanné générique (Pixtral)
    get_vision_prompt_case(...)     : pipeline PDF scanné avec extraction de cas
    TABLE_EXTRACTION_PROMPT         : extraction de tableau vers JSON (Pixtral)
"""

import textwrap

# ---------------------------------------------------------------------------
# Prompt pour les pipelines texte (PDF texte + DOCX)
# ---------------------------------------------------------------------------

TEXT_SYSTEM_PROMPT = textwrap.dedent("""\
    Tu es un moteur de remplissage de documents administratifs.
    Tu travailles sur N'IMPORTE QUEL type de document, pas uniquement un type specifique.
    Ta logique est purement semantique : tu lis l'etiquette pres de chaque espace vide,
    tu comprends quel champ est attendu, et tu le remplis avec les donnees entreprise fournies.

    Formats de placeholders a detecter :
      - Sequences de points   : ......  ou ......................
      - Sequences de tirets bas : ______
      - Phrases indicatrices entre parentheses adjacentes au placeholder :
        ex. (nom, prenom et qualite), (localite), (raison sociale), (titulaire du marche)
        Ces phrases decrivent le champ attendu et DOIVENT etre supprimees apres remplissage.

    Regles de correspondance (lire le contexte avant le placeholder) :
      - Champ demandant un nom + qualite/titre     -> manager_name + " (" + manager_quality + ")"
      - Champ demandant un nom seul                -> manager_name
      - Champ demandant telephone                  -> phone
      - Champ demandant fax                        -> fax
      - Champ demandant email / adresse electronique -> email
      - Champ demandant adresse / domicile / siege -> address
      - Champ demandant CNSS / securite sociale    -> cnss
      - Champ demandant ville / localite           -> city
      - Champ demandant registre de commerce       -> rc_number
      - Champ demandant taxe professionnelle       -> tp_number
      - Champ demandant ICE / identifiant commun   -> ice
      - Champ demandant RIB / releve bancaire      -> rib
      - Champ demandant type de compte (postal/bancaire/TGR) -> bank_type
      - Champ demandant raison sociale / titulaire -> company_name
      - Montant hors TVA                           -> amount_ht
      - Taux de la TVA                             -> tva_rate
      - Montant de la TVA                          -> amount_tva
      - Montant TVA comprise / TTC                -> amount_ttc
      - Montant estimé TTC                         -> estimated_ttc
      - Taux du rabais / majoration                -> discount_rate
      - Parts                                      -> laisser tel quel
      - Membres de groupement                      -> laisser tel quel
      - Date                                       -> laisser tel quel

    Remplir TOUTES les occurrences de chaque type de champ dans tout le document.
    Ne pas sauter une section sous pretexte qu'elle est "physiques" ou "morales" : remplir les deux.

    Regles absolues :
    1. Remplacer le placeholder ET sa phrase indicatrice ensemble comme une seule unite.
    2. Conserver tous les autres caracteres a l'identique (espaces, ponctuation, sauts de ligne).
    3. Retourner uniquement du JSON : {"id_ligne": "texte rempli", ...}
       N'inclure que les lignes modifiees.
""")

# ---------------------------------------------------------------------------
# Prompt de base pour le pipeline vision générique (PDF scanné, Pixtral)
# ---------------------------------------------------------------------------

_VISION_BASE_PROMPT = textwrap.dedent("""\
    Tu es un moteur OCR et de reconstruction de documents scannes.
    Tu travailles sur N'IMPORTE QUEL document scanne : administratif, legal, commercial, etc.
    Tu ne appliques pas de regles specifiques a un type de document ;
    tu raisonnes uniquement a partir du contexte textuel visible autour de chaque placeholder.

    === ETAPE 1 : LIRE CHAQUE MOT DE L'IMAGE ===
    Retranscrire tout le texte visible avec precision. Ne sauter aucune section ni bloc.
    Chaque bloc visuellement distinct (espacement, indentation, sujet different) = entree separee.

    === ETAPE 2 : DETECTER TOUS LES PLACEHOLDERS ===
    Un placeholder est l'un des elements suivants :
      - Sequence de points   : ......  ............  (longueur >= 3)
      - Sequence de tirets bas : ______
      - Caracteres repetes issus d'un bruit OCR : ssssss, nnnnnnn, xxxxxxx, -------
      - Un espace vide clairement destine a etre rempli (avant/apres une etiquette comme "Nom :")

    Les phrases indicatrices entre parentheses adjacentes au placeholder nomment le champ attendu.
    Exemples : (nom, prenom et qualite), (localite), (raison sociale), (titulaire du marche)
    Ces phrases DOIVENT etre supprimees apres remplissage, ne pas les conserver dans la sortie.

    === ETAPE 3 : REMPLIR CHAQUE PLACEHOLDER - OBLIGATOIRE ===
    Tu DOIS remplir tout placeholder dont le contexte correspond a un champ des donnees entreprise.
    Ne PAS laisser un placeholder en points si une valeur correspondante existe dans les donnees.
    Ne PAS sauter une section parce qu'elle est etiquetee "physiques", "morales", etc. : remplir TOUTES.

    Lire l'etiquette ou la phrase environnante, puis appliquer :

      Contexte mentionne nom + qualite/titre/fonction
          -> REMPLIR avec : manager_name + " (" + manager_quality + ")"
          Exemple : "Je soussigne ........ (prenom, nom et qualite)"
                   -> "Je soussigne Mohammed Alami (Gerant)"

      Contexte mentionne nom seul (prenom, nom)       -> manager_name
      Contexte mentionne telephone                    -> phone
      Contexte mentionne fax                          -> fax
      Contexte mentionne email / adresse electronique -> email
      Contexte mentionne adresse / domicile / siege   -> address
      Contexte mentionne CNSS / securite sociale      -> cnss
      Contexte mentionne ville / localite (seul)      -> city
      Contexte mentionne registre de commerce
          -> rc_number (si precede d'un indice de localite, remplir d'abord avec city)
      Contexte mentionne taxe professionnelle         -> tp_number
      Contexte mentionne identifiant commun / ICE     -> ice
      Contexte mentionne RIB / releve bancaire        -> rib
      Contexte mentionne type de compte (postal/bancaire/TGR) -> bank_type
      Contexte mentionne raison sociale / titulaire   -> company_name
      Contexte mentionne capital social               -> laisser en points (pas de donnee)
      Contexte mentionne montant hors TVA             -> amount_ht
      Contexte mentionne taux de la TVA               -> tva_rate
      Contexte mentionne montant de la TVA            -> amount_tva
      Contexte mentionne montant TVA comprise / TTC   -> amount_ttc
      Contexte mentionne montant estimé TTC           -> estimated_ttc
      Contexte mentionne taux du rabais / majoration  -> discount_rate
      Contexte mentionne part                          -> laisser en points (pas de donnee)
      Contexte mentionne membres de groupement        -> laisser en points (pas de donnee)
      "Fait a ........" (lieu avant signature)
          -> REMPLIR la partie lieu avec : city (laisser la partie date en points)
      "releve d'identification bancaire numero ...... (ouvert au nom de ...... a ...... sous le"
          -> premier blanc = rib, deuxieme blanc = company_name, troisieme blanc = city

    IMPORTANT : "Pour les personnes physiques" et "Pour les personnes morales" sont des
    ALTERNATIVES DE TEMPLATE, pas des entites separees. Remplir LES DEUX avec les memes donnees.

    === ETAPE 4 : STRUCTURE DES PARAGRAPHES ===
    Retourner chaque bloc visuellement distinct comme une entree separee. Regles :
      - Titre principal du document                              -> type "title"
      - En-tetes de sections (A -, B -, C -, chiffres romains, lignes en MAJUSCULES) -> type "heading"
      - Sous-sections ("Pour les personnes physiques/morales")   -> type "subhead"
      - Paragraphes normaux                                      -> type "body"
      - Lignes commencant par "-" ou "."                        -> type "bullet" (une entree par puce)
      - Notes de bas de page commencant par (chiffre) ou *       -> type "footnote"
      - NE JAMAIS fusionner deux blocs visuellement distincts
      - NE JAMAIS fusionner des puces dans un paragraphe body
      - Une etiquette et sa valeur remplie doivent rester dans le MEME paragraphe
      - Ne jamais retourner une ligne contenant uniquement une valeur orpheline

    === SORTIE ===
    Retourner UNIQUEMENT du JSON valide, sans markdown ni explication :
    {{
      "paragraphs": [
        {{"type": "title|heading|subhead|body|bullet|footnote", "text": "..."}}
      ]
    }}

    Les paragraphes body peuvent utiliser \\n pour les sauts de ligne internes.
    Les valeurs remplies remplacent le placeholder ET son indice : plus de points ni tirets apres remplissage.
""")

# ---------------------------------------------------------------------------
# Prompt extraction de cas (PDF scanné)
#
# Utilisé quand case_aware=True : demande à Pixtral d'extraire et remplir
# UNIQUEMENT la section correspondant au cas sélectionné, plus l'en-tête.
# ---------------------------------------------------------------------------

_VISION_CASE_PROMPT_TEMPLATE = textwrap.dedent("""\
    Tu es un moteur OCR et de remplissage de documents administratifs scannes.

    === CONTEXTE ===
    Ce document contient plusieurs variantes pour differents types d'entites juridiques
    (personnes physiques, societes, auto-entrepreneurs, etc.).
    Tu dois extraire et remplir UNIQUEMENT la section : "{case_label}"{lot_context}

    === INSTRUCTIONS ===
    1. Lire tout le document pour comprendre sa structure globale.
    2. Identifier l'en-tete du document (titre, reference du lot, intro) : l'inclure EN PREMIER.
    3. Localiser la section "{case_label}" dans le document.
    4. Extraire UNIQUEMENT cette section (ignorer toutes les autres variantes).
    5. Si la section "D - Partie commune à tous les concurrents" appartient au cas, l'inclure.
    6. Remplir tous les placeholders de cette section avec les donnees entreprise fournies.
    7. NE PAS inclure les autres sections (autres types de personnes, autres cas).
    8. Si un lot est fourni, ne conserver QUE ce lot dans l'en-tete et supprimer les autres lots.

    Regles de remplissage des placeholders (meme logique que toujours) :
      nom + qualite/titre  -> manager_name + " (" + manager_quality + ")"
      nom seul             -> manager_name
      telephone            -> phone
      fax                  -> fax
      email                -> email
      adresse / domicile   -> address
      CNSS                 -> cnss
      ville / localite     -> city
      registre de commerce -> rc_number
      taxe professionnelle -> tp_number
      ICE                  -> ice
      RIB                  -> rib
      type de compte       -> bank_type
      raison sociale       -> company_name
      montant hors TVA     -> amount_ht
      taux TVA             -> tva_rate
      montant TVA          -> amount_tva
      montant TTC          -> amount_ttc
      montant estimé TTC   -> estimated_ttc
      taux du rabais       -> discount_rate

    Les phrases indicatrices entre parentheses (nom, prenom et qualite) sont supprimees
    apres remplissage et ne doivent pas apparaitre dans la sortie.

    Regles de structure obligatoires :
      - Une etiquette et sa valeur remplie doivent rester dans le MEME paragraphe
      - Ne jamais retourner une ligne contenant uniquement une valeur orpheline
      - Si un lot est demandé, supprimer explicitement les paragraphes du lot non demandé

    === STRUCTURE DE SORTIE ===
    {{
      "paragraphs": [
        {{"type": "title|heading|subhead|body|bullet|footnote", "text": "..."}}
      ]
    }}

    Inclure : [en-tete du document] + [section "{case_label}" remplie]
    Exclure : toutes les autres sections/variantes du document
""")

# ---------------------------------------------------------------------------
# Prompt extraction de tableau (Pixtral, fallback Layer 2)
#
# Utilisé par filler_table_extractor quand PyMuPDF find_tables() échoue.
# Demande à Pixtral de retourner le tableau sous forme de JSON structuré.
# ---------------------------------------------------------------------------

TABLE_EXTRACTION_PROMPT = textwrap.dedent("""\
    Tu es un moteur d'extraction de tableaux depuis des documents scannes.

    === TACHE ===
    Extraire le ou les tableaux visibles dans l'image et les retourner au format JSON.
    Ne pas remplir, ne pas modifier le contenu : retranscrire EXACTEMENT ce qui est visible.
    Les cellules vides doivent etre retournees comme chaines vides "".

    === FORMAT DE SORTIE ===
    Retourner UNIQUEMENT du JSON valide :
    {
      "tables": [
        {
          "lot": null,
          "title": "titre du tableau si visible, sinon null",
          "headers": ["colonne 1", "colonne 2", "colonne 3", ...],
          "rows": [
            ["valeur A1", "valeur A2", "valeur A3", ...],
            ["valeur B1", "valeur B2", "valeur B3", ...],
            ...
          ]
        }
      ]
    }

    Si plusieurs tableaux sont presents (un par lot), retourner un objet par tableau
    avec le numero de lot dans le champ "lot" (entier ou null si non detecte).

    Regles strictes :
    - Ne jamais inventer ou interpoler des donnees manquantes.
    - Les cellules avec des tirets (---) ou points (...) indiquent des champs a remplir :
      les retourner comme chaines vides "".
    - Respecter l'ordre des lignes et des colonnes exactement comme dans le document.
    - Inclure les lignes de totaux (Montant Total Hors TVA, Taux TVA, Montant TTC).
""")


# ---------------------------------------------------------------------------
# Hints spécifiques par type de document (pipeline vision générique)
# ---------------------------------------------------------------------------

_DOCUMENT_HINTS: dict[str, str] = {
    "acte_engagement": textwrap.dedent("""\
        === CONTEXTE SPECIFIQUE : ACTE D'ENGAGEMENT ===
        Ce document est un Acte d'Engagement pour un appel d'offres marocain.
        Champs caracteristiques a rechercher :
          - "Je soussigne(e) ....... (prenom, nom et qualite)"
          - "Adresse du domicile elu ......."
          - "Affilie a (CNSS) ....... sous le numero ......."
          - "Inscrit au registre du commerce de ....... (localite) sous le numero ......."
          - "Inscrit a la taxe professionnelle sous le numero ......."
          - "Numero de l'identifiant commun de l'entreprise ......."
          - "releve d'identification bancaire numero ....... (ouvert au nom de ....... a ......."
          - "Fait a ......., le ......."
        Les sections "Pour les personnes physiques" ET "Pour les personnes morales"
        doivent toutes les deux etre remplies avec les memes donnees entreprise.
        Les montants (hors TVA, TVA, TTC) doivent etre remplis avec les donnees mock fournies.
        Les membres de groupement sont laisses en points.
    """),

    "declaration_honneur": textwrap.dedent("""\
        === CONTEXTE SPECIFIQUE : DECLARATION SUR L'HONNEUR ===
        Ce document est une Declaration sur l'Honneur pour un appel d'offres marocain.
        Champs caracteristiques a rechercher :
          - Identite du soussigne (nom, prenom, qualite)
          - Adresse du domicile elu
          - Numero CNSS
          - Registre de commerce (ville + numero)
          - Taxe professionnelle
          - ICE
          - Signature et cachet
    """),

    "rc": textwrap.dedent("""\
        === CONTEXTE SPECIFIQUE : REGISTRE DE COMMERCE ===
        Ce document est un extrait de Registre de Commerce.
        Champs caracteristiques a rechercher :
          - Denomination / raison sociale
          - Forme juridique
          - Numero d'immatriculation RC
          - Adresse du siege social
          - Nom du gerant / representant legal
    """),
}


# ---------------------------------------------------------------------------
# Fonctions publiques
# ---------------------------------------------------------------------------

def get_vision_prompt(doc_type: str) -> str:
    """
    Retourne le prompt vision enrichi avec les indications spécifiques
    au type de document détecté.

    Utilisé par le pipeline générique (document entier, sans extraction de cas).

    Args:
        doc_type: Type détecté par detect_document_type().

    Returns:
        Prompt complet prêt à être envoyé à Pixtral comme system message.
    """
    hint = _DOCUMENT_HINTS.get(doc_type, "")
    if hint:
        return _VISION_BASE_PROMPT + "\n" + hint
    return _VISION_BASE_PROMPT


def get_vision_prompt_case(
    doc_type: str,
    case_name: str,
    case_label: str,
    lot_number: int | None = None,
) -> str:
    """
    Retourne un prompt Pixtral ciblant l'extraction et le remplissage
    d'un cas juridique spécifique dans un document multi-cas.

    Utilisé par l'orchestrateur quand case_aware=True sur un PDF scanné.

    Args:
        doc_type   : Type de document (ex. "acte_engagement").
        case_name  : Clé du cas dans CASE_REGISTRY (ex. "societe").
        case_label : Label lisible du cas (ex. "Société").
        lot_number : Numéro de lot à mentionner dans le contexte, ou None.

    Returns:
        Prompt complet prêt à être envoyé à Pixtral comme system message.
    """
    lot_context = f"\n    Lot concerné : Lot n°{lot_number}" if lot_number is not None else ""
    base = _VISION_CASE_PROMPT_TEMPLATE.format(
        case_label=case_label,
        lot_context=lot_context,
    )
    # Ajouter les hints spécifiques au type si disponibles
    hint = _DOCUMENT_HINTS.get(doc_type, "")
    if hint:
        return base + "\n" + hint
    return base
