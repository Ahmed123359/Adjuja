from dataclasses import dataclass
from app.models.appel_offre import AppelOffre
from app.models.generation import GenerationRequest


@dataclass
class SectionConfig:
    """Configuration d'une section de réponse à générer."""
    titre:        str  # Titre affiché dans le document final (FR)
    titre_en:     str  # Titre en anglais
    role:         str  # Rôle joué par le LLM pour cette section
    focus:        str  # Objectif principal de la section
    instructions: str  # Directives détaillées de rédaction


# ── Sections et leurs prompts spécialisés ─────────────────────────────────

SECTIONS: list[SectionConfig] = [
    SectionConfig(
        titre="Présentation de notre entreprise",
        titre_en="Company Overview",
        role="responsable commercial senior de l'entreprise répondante",
        focus="Présenter l'entreprise de manière percutante, ancrée dans les enjeux de CET appel d'offres.",
        instructions="""
- Longueur cible : 300 à 400 mots
- Commence par une accroche forte (évite absolument "Créée en XXXX, notre entreprise...")
- Mets en avant les 2-3 expertises directement alignées avec l'objet du marché
- Intègre les chiffres clés (effectif, CA, ancienneté) de façon naturelle dans le texte, pas en liste
- Termine sur un positionnement différenciant : pourquoi NOUS plutôt qu'un concurrent
- Ton : professionnel et convaincant, sans jargon creux ni formules trop institutionnelles
""",
    ),
    SectionConfig(
        titre="Compréhension de vos besoins",
        titre_en="Understanding Your Needs",
        role="chef de projet senior ayant analysé le cahier des charges en profondeur",
        focus="Démontrer une compréhension analytique et fine du cahier des charges — pas une simple reformulation.",
        instructions="""
- Longueur cible : 400 à 500 mots
- Ne pas lister les besoins : reformuler avec ta propre analyse des enjeux réels
- Identifier les besoins implicites au-delà des exigences explicites du CDC
- Mentionner les contraintes, risques et points de vigilance identifiés
- Citer au moins 2 éléments SPÉCIFIQUES du cahier des charges pour prouver une vraie lecture
- Montrer la maîtrise du secteur et du contexte de l'acheteur (ses contraintes institutionnelles, budget, délais)
- Ton : analytique et expert, démontrant une vraie valeur ajoutée dans l'analyse
""",
    ),
    SectionConfig(
        titre="Notre approche méthodologique",
        titre_en="Our Methodological Approach",
        role="directeur technique et expert métier",
        focus="Décrire une méthodologie concrète, éprouvée, parfaitement adaptée aux contraintes de cet AO.",
        instructions="""
- Longueur cible : 400 à 500 mots
- Structurer les grandes phases de la mission avec leurs livrables attendus
- Mentionner les outils, frameworks et bonnes pratiques spécifiques au secteur
- Inclure un point dédié à la gestion des risques et au contrôle qualité
- Adapter explicitement la méthode aux contraintes de délai, de budget et de périmètre de l'AO
- Montrer comment la méthodologie couvre les critères de sélection pondérés
- Ton : expert et rassurant, donnant une vraie confiance dans la capacité d'exécution
""",
    ),
    SectionConfig(
        titre="Moyens humains et techniques mobilisés",
        titre_en="Human and Technical Resources",
        role="directeur des opérations",
        focus="Présenter l'équipe projet et les ressources comme un gage concret et chiffré de réussite.",
        instructions="""
- Longueur cible : 300 à 400 mots
- Présenter l'équipe en **tableau Markdown** : | Profil | Expérience | Certifications | Rôle sur ce marché |
- Mentionner les outils, équipements, licences et infrastructures disponibles (liste ou tableau séparé si pertinent)
- Insister sur la disponibilité et l'engagement dédié à ce marché (pas "mutualisé")
- Si l'AO mentionne des exigences de ressources minimales, y répondre point par point
- Donner des chiffres concrets : nombre d'ETP dédiés, capacité de livraison, etc.
- Ton : factuel et rassurant, évitant les formules vides du type "équipe de haut niveau"
""",
    ),
    SectionConfig(
        titre="Références similaires",
        titre_en="Relevant References",
        role="directeur commercial présentant le portfolio de réalisations",
        focus="Prouver par des réalisations concrètes et mesurables la capacité à réussir ce marché.",
        instructions="""
- Longueur cible : 300 à 400 mots
- Présenter 3 à 5 références en **tableau Markdown obligatoire** : | Client | Mission | Budget | Délai | Résultat mesurable |
- Choisir des références alignées avec les critères de l'AO (taille, secteur, complexité similaire)
- Inclure des indicateurs concrets pour chaque référence : budget, délai tenu, taux de satisfaction
- Si les références du profil entreprise ne sont pas détaillées, créer des exemples réalistes et cohérents avec les expertises déclarées
- Relier explicitement chaque référence aux exigences de cet AO spécifique
- Après le tableau, ajouter 1-2 phrases de synthèse soulignant la cohérence du portfolio
- Ton : factuel, sans exagération, démontrant une solide track record
""",
    ),
    SectionConfig(
        titre="Planning prévisionnel",
        titre_en="Project Timeline",
        role="chef de projet PMO certifié",
        focus="Proposer un planning réaliste, structuré et rigoureusement aligné avec les délais de l'AO.",
        instructions="""
- Longueur cible : 300 à 400 mots
- Présenter les phases en **tableau Markdown obligatoire** : | Phase | Durée | Livrables | Responsable | Jalons |
- Identifier les dépendances entre phases et les points de validation client
- Si l'AO mentionne une date de démarrage ou de livraison finale, s'y conformer explicitement
- Inclure une ligne dédiée à la marge de sécurité dans le tableau
- Après le tableau, commenter en 2-3 phrases les points critiques du planning
- Ton : rigoureux et démontrant une vraie maîtrise des délais
""",
    ),
    SectionConfig(
        titre="Proposition financière",
        titre_en="Financial Proposal",
        role="directeur financier et commercial",
        focus="Valoriser l'offre en termes de ROI et de transparence — pas seulement de prix.",
        instructions="""
- Longueur cible : 300 à 400 mots
- Décomposer l'offre en **tableau Markdown** : | Composante | Description | Part relative |
- Mettre en avant le rapport qualité/prix et la valeur ajoutée générée pour l'acheteur
- Mentionner les conditions de paiement, les garanties et les engagements contractuels
- Si le budget estimé de l'AO est connu, y aligner l'offre explicitement
- Si le budget n'est pas connu, éviter les chiffres précis et valoriser la transparence tarifaire
- Ajouter un tableau ROI/TCO si pertinent : | Indicateur | Sans notre solution | Avec notre solution |
- NE PAS chercher à paraître moins cher ni à compenser un critère prix élevé par du volume de texte
- Le prix est fixé par l'entreprise : cette section doit justifier la valeur, pas négocier le tarif
- Ton : transparent et orienté valeur, démontrant que le coût est maîtrisé et le ROI mesurable
""",
    ),
    SectionConfig(
        titre="Conclusion et engagements",
        titre_en="Conclusion and Commitments",
        role="dirigeant de l'entreprise s'engageant personnellement",
        focus="Conclure de manière mémorable avec des engagements forts et un appel à l'action clair.",
        instructions="""
- Longueur cible : 200 à 300 mots
- Résumer en 3 raisons clés et différenciantes de choisir notre entreprise (pas génériques)
- Prendre des engagements fermes et mesurables : délais, qualité, disponibilité, réactivité
- Proposer une prochaine étape concrète et facile pour l'acheteur (réunion de lancement, démo...)
- Terminer sur une formule professionnelle mais mémorable — pas le cliché "restant à votre disposition"
- Ton : confiant, engagé, donnant sincèrement envie de démarrer la collaboration
""",
    ),
]


# ── Service ────────────────────────────────────────────────────────────────

class PromptBuilderService:
    """
    Service de construction des prompts pour la génération multi-appels.

    Architecture :
    - Phase 1 : build_brief_prompt()   → 1 appel LLM pour le brief stratégique
    - Phase 2 : build_section_prompt() → 1 appel par section (en parallèle)

    Le brief stratégique est injecté dans chaque prompt de section pour garantir
    la cohérence du fil rouge à travers toute la réponse.
    """

    _EXPERT_ROLE_FR = (
        "Tu es un expert senior en rédaction de réponses aux appels d'offres publics et privés, "
        "avec 15 ans d'expérience. Tu rédiges des réponses percutantes, structurées et adaptées "
        "aux attentes des acheteurs publics et privés marocains et internationaux."
    )
    _EXPERT_ROLE_EN = (
        "You are a senior expert in writing responses to public and private tenders, "
        "with 15 years of experience. You write compelling, structured responses tailored "
        "to the expectations of public and private buyers."
    )

    def _expert_role(self, langue: str) -> str:
        return self._EXPERT_ROLE_EN if langue == "en" else self._EXPERT_ROLE_FR

    def _langue_instruction(self, langue: str) -> str:
        if langue == "en":
            return "---\n## LANGUAGE\nWrite the entire response **in English**."
        return ""

    def _section_titre(self, section: "SectionConfig", langue: str) -> str:
        return section.titre_en if langue == "en" else section.titre

    def get_sections(self) -> list[SectionConfig]:
        """Retourne la liste ordonnée des sections à générer."""
        return SECTIONS

    # ── Prompts principaux ─────────────────────────────────────────────────

    def build_brief_prompt(
        self,
        ao: AppelOffre,
        request: GenerationRequest,
    ) -> tuple[str, str]:
        """
        Construit les prompts (system, user) pour le brief stratégique.

        Le brief est un document interne court qui établit le fil rouge :
        enjeux clés, différenciants, messages porteurs et ton à adopter.
        Il sera injecté dans chaque prompt de section.

        Returns:
            Tuple (system_prompt, user_prompt).
        """
        langue = request.langue
        system = (
            self._expert_role(langue)
            + (" You analyse a tender and prepare an internal strategic brief "
               "that will guide the writing of each section of the response."
               if langue == "en" else
               " Tu analyses un appel d'offres et prépares un brief stratégique interne "
               "qui guidera la rédaction de chaque section de la réponse.")
        )

        if langue == "en":
            brief_instruction = """---
## STRATEGIC BRIEF TO PRODUCE

Write an internal strategic brief (max 350 words) structured EXACTLY as follows:

**KEY STAKES**: the 3 main issues identified in the tender (buyer's real needs)
**DIFFERENTIATORS**: the 3 company strengths most relevant to THIS tender
**KEY MESSAGES**: the 2-3 messages to reinforce throughout all sections
**TONE & ANGLE**: the positioning and tone to adopt throughout the response
**SECTION WEIGHTING**: based on the evaluation criteria and their weights, identify where the buyer is most sensitive and reinforce the value argumentation in the technical sections accordingly. IMPORTANT: a high price weight does NOT mean developing the financial section more — the price itself is set by the company's management, not by this response. Instead, reinforce ROI justification and risk reduction arguments throughout ALL sections. Always prioritize methodology, references, and team sections as they demonstrate execution capability. If no criteria are specified, prioritize methodology and references.

Be concise, precise and actionable. This brief will be the compass for the entire response.
Write the brief **in English**."""
        else:
            brief_instruction = """---
## BRIEF STRATÉGIQUE À PRODUIRE

Rédige un brief stratégique interne (350 mots maximum) structuré EXACTEMENT ainsi :

**ENJEUX CLÉS** : les 3 enjeux principaux identifiés dans l'AO (besoins réels de l'acheteur)
**DIFFÉRENCIANTS** : les 3 points forts de l'entreprise les plus pertinents pour CET AO
**MESSAGES PORTEURS** : les 2-3 messages à répéter et renforcer dans toutes les sections
**TON ET ANGLE** : le positionnement et le ton à adopter dans toute la réponse
**PONDÉRATION DES SECTIONS** : selon les critères d'évaluation et leurs poids, identifie où l'acheteur est le plus sensible et renforce l'argumentation de valeur dans les sections techniques en conséquence. IMPORTANT : un poids élevé sur le Prix ne signifie PAS développer davantage la section financière — le prix est fixé par la direction de l'entreprise, pas par cette réponse. En revanche, renforce l'argumentation ROI et la réduction de risque dans TOUTES les sections. Priorise toujours la méthodologie, les références et les moyens humains car ils démontrent la capacité d'exécution. Si aucun critère n'est précisé, prioriser la méthodologie et les références.

Sois concis, précis et actionnable. Ce brief sera la boussole de toute la rédaction."""

        user = "\n\n".join(filter(None, [
            self._bloc_ao(ao),
            self._bloc_entreprise(request.contexte_entreprise),
            self._bloc_criteres(ao),
            self._bloc_instructions_sup(request),
            self._langue_instruction(langue),
            brief_instruction,
        ]))

        return system, user

    def build_section_prompt(
        self,
        section: SectionConfig,
        ao: AppelOffre,
        request: GenerationRequest,
        brief: str,
        rag_context: str = "",
    ) -> tuple[str, str]:
        """
        Construit les prompts (system, user) pour une section spécifique.

        Le brief stratégique est injecté pour assurer la cohérence avec
        les autres sections générées en parallèle.

        Args:
            section: Configuration de la section (titre, rôle, focus, instructions).
            ao:      Appel d'offres parsé.
            request: Requête avec contexte entreprise et paramètres.
            brief:   Brief stratégique généré en phase 1.

        Returns:
            Tuple (system_prompt, user_prompt).
        """
        langue = request.langue
        titre  = self._section_titre(section, langue)

        if langue == "en":
            system = (
                f"{self._expert_role(langue)} "
                f"You are writing the \"{titre}\" section of a tender response. "
                f"For this section, you play the role of {section.role}."
            )
            closing = f"""---
## SECTION TO WRITE: "{titre}"

**Objective:** {section.focus}

**Writing instructions:**
{section.instructions}

---
Write only the content of this section, in rich Markdown (bold, lists, **Markdown tables where relevant**).
Table syntax: `| Col A | Col B | Col C |\\n|---|---|---|\\n| val | val | val |`
Use tables whenever presenting structured, comparable or sequential data.
Do NOT include the heading (## {titre}) — it will be added automatically.
Do NOT generate other sections. Do NOT comment on the instructions received.
Write **in English**."""
        else:
            system = (
                f"{self._expert_role(langue)} "
                f"Tu rédiges la section « {titre} » d'une réponse à appel d'offres. "
                f"Pour cette section, tu joues le rôle du {section.role}."
            )
            closing = f"""---
## SECTION À RÉDIGER : « {titre} »

**Objectif :** {section.focus}

**Instructions de rédaction :**
{section.instructions}

---
Rédige uniquement le contenu de cette section, en Markdown enrichi (gras, listes, **tableaux Markdown si pertinent**).
Syntaxe tableau : `| Col A | Col B | Col C |\\n|---|---|---|\\n| val | val | val |`
Utilise des tableaux chaque fois que tu présentes des données structurées, comparables ou séquentielles.
N'inclus PAS le titre (## {titre}) — il sera ajouté automatiquement.
Ne génère PAS d'autres sections. Ne commente PAS les instructions reçues."""

        user = "\n\n".join(filter(None, [
            self._bloc_ao(ao),
            self._bloc_entreprise(request.contexte_entreprise),
            self._bloc_criteres(ao),
            f"""---
## BRIEF STRATÉGIQUE — FIL ROUGE DE TOUTE LA RÉPONSE

{brief}""",
            rag_context or None,
            self._bloc_instructions_sup(request),
            self._langue_instruction(langue),
            closing,
        ]))

        return system, user

    # ── Blocs réutilisables ────────────────────────────────────────────────

    def _bloc_ao(self, ao: AppelOffre) -> str:
        lignes = ["---", "## APPEL D'OFFRES", f"**Titre :** {ao.titre}"]
        if ao.reference:
            lignes.append(f"**Référence :** {ao.reference}")
        if ao.acheteur:
            lignes.append(f"**Acheteur :** {ao.acheteur}")
        if ao.budget_estime:
            lignes.append(f"**Budget estimé :** {ao.budget_estime:,.0f} €")
        if ao.date_limite:
            lignes.append(f"**Date limite :** {ao.date_limite}")
        lignes.append(f"\n**Type de marché :** {ao.type_marche.value}")
        lignes.append(f"\n**Description :**\n{ao.description_globale[:1500]}")
        if ao.sections:
            lignes.append("\n**Sections identifiées dans le cahier des charges :**")
            for s in ao.sections[:5]:
                lignes.append(f"- **{s.titre}** : {s.contenu[:150]}…")
        return "\n".join(lignes)

    def _bloc_entreprise(self, ctx) -> str:
        lignes = ["---", "## PROFIL DE NOTRE ENTREPRISE", f"**Raison sociale :** {ctx.nom}"]
        if ctx.description:
            lignes.append(f"**Description :** {ctx.description}")
        if ctx.expertises:
            lignes.append(f"**Expertises :** {', '.join(ctx.expertises)}")
        if ctx.references:
            lignes.append("**Références projets :**")
            for ref in ctx.references[:5]:
                lignes.append(f"  - {ref}")
        if ctx.effectif:
            lignes.append(f"**Effectif :** {ctx.effectif} collaborateurs")
        if ctx.chiffre_affaires:
            lignes.append(f"**Chiffre d'affaires :** {ctx.chiffre_affaires}")
        return "\n".join(lignes)

    def _bloc_criteres(self, ao: AppelOffre) -> str:
        if not ao.criteres:
            return ""
        lignes = ["---", "## CRITÈRES DE SÉLECTION (à adresser impérativement)"]
        for c in ao.criteres:
            ligne = f"- **{c.nom}** (pondération : {c.ponderation}%)"
            if c.description:
                ligne += f" — {c.description}"
            lignes.append(ligne)
        return "\n".join(lignes)

    def _bloc_instructions_sup(self, request: GenerationRequest) -> str:
        if not request.instructions_supplementaires:
            return ""
        return f"---\n## INSTRUCTIONS ADDITIONNELLES\n{request.instructions_supplementaires}"
