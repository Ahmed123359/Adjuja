import re
from app.models.appel_offre import AppelOffre, Section, Critere, TypeMarche


class AOParserService:
    """
    Service de parsing et d'analyse d'un appel d'offres brut.

    Responsabilité unique : transformer un texte brut en un objet AppelOffre structuré.
    """

    # Mots-clés pour détecter le type de marché
    _KEYWORDS_TYPE: dict[TypeMarche, list[str]] = {
        TypeMarche.TRAVAUX:      ["travaux", "construction", "bâtiment", "génie civil", "rénovation"],
        TypeMarche.FOURNITURES:  ["fourniture", "livraison", "matériel", "équipement", "achat"],
        TypeMarche.SERVICES:     ["prestation", "service", "conseil", "étude", "formation", "assistance"],
    }

    # Titres de sections couramment rencontrés dans les AO
    _SECTION_PATTERNS = [
        r"(?i)^#+\s+(.+)$",               # Titres Markdown
        r"(?i)^([A-Z][A-Z\s]{3,})\s*:?$", # TITRES EN MAJUSCULES
        r"(?i)^(\d+[\.\)]\s+.+)$",        # 1. Titre ou 1) Titre
    ]

    def parse(self, texte_brut: str) -> AppelOffre:
        """
        Parse le texte brut d'un AO et retourne un objet AppelOffre structuré.

        Args:
            texte_brut: Le texte complet de l'appel d'offres

        Returns:
            AppelOffre structuré
        """
        texte_nettoye = self._nettoyer(texte_brut)

        return AppelOffre(
            titre=self._extraire_titre(texte_nettoye),
            reference=self._extraire_reference(texte_nettoye),
            acheteur=self._extraire_acheteur(texte_nettoye),
            type_marche=self._detecter_type(texte_nettoye),
            description_globale=texte_nettoye[:2000],
            sections=self._extraire_sections(texte_nettoye),
            criteres=self._extraire_criteres(texte_nettoye),
            budget_estime=self._extraire_budget(texte_nettoye),
            texte_brut=texte_brut,
        )

    # -------------------------------------------------------------------------
    # Méthodes privées d'extraction
    # -------------------------------------------------------------------------

    def _nettoyer(self, texte: str) -> str:
        """Supprime les espaces et lignes vides excessifs."""
        texte = re.sub(r"\r\n", "\n", texte)
        texte = re.sub(r"\n{3,}", "\n\n", texte)
        return texte.strip()

    def _extraire_titre(self, texte: str) -> str:
        """Extrait le titre de l'AO depuis la première ligne significative."""
        for ligne in texte.splitlines():
            ligne = ligne.strip()
            if len(ligne) > 10:
                # Enlève les préfixes Markdown
                return re.sub(r"^#+\s*", "", ligne)
        return "Appel d'offres"

    def _extraire_reference(self, texte: str) -> str:
        """Tente d'extraire une référence/numéro de marché."""
        patterns = [
            r"(?i)référence\s*[:\-]\s*([A-Z0-9\-/]+)",
            r"(?i)n°\s*([A-Z0-9\-/]+)",
            r"(?i)marché\s+n[°o]\s*([A-Z0-9\-/]+)",
        ]
        for pattern in patterns:
            match = re.search(pattern, texte)
            if match:
                return match.group(1).strip()
        return ""

    def _extraire_acheteur(self, texte: str) -> str:
        """Tente d'identifier l'organisme acheteur."""
        patterns = [
            r"(?i)pouvoir\s+adjudicateur\s*[:\-]\s*(.+)",
            r"(?i)acheteur\s*[:\-]\s*(.+)",
            r"(?i)maître\s+d['']ouvrage\s*[:\-]\s*(.+)",
            r"(?i)client\s*[:\-]\s*(.+)",
        ]
        for pattern in patterns:
            match = re.search(pattern, texte)
            if match:
                return match.group(1).strip()[:200]
        return ""

    def _detecter_type(self, texte: str) -> TypeMarche:
        """Détecte le type de marché à partir des mots-clés."""
        texte_lower = texte.lower()
        scores: dict[TypeMarche, int] = {t: 0 for t in TypeMarche}

        for type_marche, keywords in self._KEYWORDS_TYPE.items():
            for kw in keywords:
                scores[type_marche] += texte_lower.count(kw)

        meilleur = max(scores, key=lambda t: scores[t])
        return meilleur if scores[meilleur] > 0 else TypeMarche.MIXTE

    def _extraire_sections(self, texte: str) -> list[Section]:
        """Découpe le texte en sections selon les titres détectés."""
        sections: list[Section] = []
        lignes = texte.splitlines()
        titre_courant = ""
        contenu_lignes: list[str] = []
        ordre = 0

        for ligne in lignes:
            titre_detecte = self._est_titre(ligne)
            if titre_detecte:
                if titre_courant:
                    sections.append(Section(
                        titre=titre_courant,
                        contenu="\n".join(contenu_lignes).strip(),
                        ordre=ordre,
                    ))
                    ordre += 1
                titre_courant = titre_detecte
                contenu_lignes = []
            else:
                contenu_lignes.append(ligne)

        if titre_courant:
            sections.append(Section(
                titre=titre_courant,
                contenu="\n".join(contenu_lignes).strip(),
                ordre=ordre,
            ))

        return sections

    def _est_titre(self, ligne: str) -> str | None:
        """Retourne le titre si la ligne est un titre, sinon None."""
        for pattern in self._SECTION_PATTERNS:
            match = re.match(pattern, ligne.strip())
            if match:
                return match.group(1).strip()
        return None

    def _extraire_criteres(self, texte: str) -> list[Critere]:
        """Extrait les critères d'évaluation et leurs pondérations."""
        criteres: list[Critere] = []
        # Cherche les patterns "critère : X%" ou "critère (X%)"
        pattern = r"(?i)([a-zàéèêëîïôùûü\s]+)\s*[:\-\(]\s*(\d+)\s*%"
        for match in re.finditer(pattern, texte):
            nom = match.group(1).strip()
            poids = float(match.group(2))
            if 0 < poids <= 100 and len(nom) > 2:
                criteres.append(Critere(nom=nom, ponderation=poids))
        return criteres

    def _extraire_budget(self, texte: str) -> float | None:
        """Tente d'extraire le budget estimé en euros."""
        patterns = [
            r"(?i)budget\s*[:\-]\s*([\d\s\.,]+)\s*€",
            r"(?i)montant\s*[:\-]\s*([\d\s\.,]+)\s*€",
            r"([\d\s\.,]+)\s*€\s*(?:HT|TTC)",
        ]
        for pattern in patterns:
            match = re.search(pattern, texte)
            if match:
                try:
                    valeur = match.group(1).replace(" ", "").replace(",", ".")
                    return float(valeur)
                except ValueError:
                    continue
        return None
