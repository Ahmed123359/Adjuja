from dataclasses import dataclass
from app.models.appel_offre import AppelOffre
from app.models.generation import GenerationRequest


@dataclass
class SectionConfig:
    """Configuration d'une section de réponse à générer."""
    titre:        str        # Titre affiché dans le document final (FR)
    titre_en:     str        # Titre en anglais
    role:         str        # Rôle joué par le LLM pour cette section
    focus:        str        # Objectif principal de la section
    instructions: str        # Directives détaillées de rédaction
    min_mots:     int = 250  # Longueur minimale en mots
    max_mots:     int = 500  # Longueur maximale en mots


# ── Formules creuses interdites ────────────────────────────────────────────

_CLICHES_FR = (
    "notre expertise reconnue, notre savoir-faire, notre solution innovante, "
    "acteur incontournable, leader du marché, de premier plan, "
    "équipe de haut niveau, nous mettons tout en œuvre, à votre entière disposition, "
    "soucieux de votre satisfaction, engagement sans faille, partenaire de confiance, "
    "solution clé en main, à la pointe de la technologie, sur mesure, "
    "approche personnalisée, fort de notre expérience, track record exceptionnel, "
    "état de l'art, expertise avérée, professionnels aguerris"
)

_CLICHES_EN = (
    "our proven expertise, our innovative solution, market leader, key player, "
    "best-in-class, state-of-the-art, our tailored approach, cutting-edge technology, "
    "dedicated to your success, our exceptional track record, industry-leading, "
    "our committed team, fully at your disposal, comprehensive solution"
)


# ── Sections ───────────────────────────────────────────────────────────────

SECTIONS: list[SectionConfig] = [
    SectionConfig(
        titre="Présentation de notre entreprise",
        titre_en="Company Overview",
        role="directeur commercial senior, auteur de la réponse, qui connaît parfaitement l'entreprise répondante",
        focus="Installer une première impression forte et différenciante, ancrée dans les enjeux spécifiques de CET appel d'offres.",
        min_mots=280,
        max_mots=400,
        instructions="""
RÈGLE ABSOLUE : N'invente aucune donnée. Si l'effectif, le CA ou les certifications ne sont pas dans le profil, ne les mentionne pas — pas même sous forme approximative ("environ X collaborateurs").

Structure :
1. Accroche (1 phrase) : commence par un constat sur l'enjeu de l'AO ou le contexte de l'acheteur. Jamais "Créée en…", "Nous sommes…" ou "Fort de nos X années…"
2. Positionnement (2-3 phrases) : qui est l'entreprise, ce qu'elle fait, en quoi c'est pertinent pour CE marché précis — citer explicitement l'objet de l'AO
3. Preuves de pertinence (2-3 points) : expertises ou réalisations directement alignées sur le CDC — si des références sont disponibles, en citer une concrète
4. Chiffres clés (1 phrase) : uniquement si présents dans le profil — intégrés dans le texte, jamais en liste
5. Différenciant conclusif (1-2 phrases) : pourquoi l'acheteur a intérêt à choisir cette entreprise pour CET AO — pas générique

Interdit :
- "Dans un contexte en constante évolution…" et toute accroche générique sur le secteur
- Citer des certifications ou chiffres non présents dans le profil
- Les formules de la liste interdite
""",
    ),
    SectionConfig(
        titre="Compréhension de vos besoins",
        titre_en="Understanding Your Needs",
        role="analyste senior ayant décortiqué le cahier des charges pour en dégager les enjeux réels",
        focus="Démontrer une lecture analytique et interprétative du CDC — l'acheteur doit sentir qu'on l'a vraiment compris, pas simplement relu.",
        min_mots=350,
        max_mots=500,
        instructions="""
RÈGLE ABSOLUE : Ne pas reformuler le CDC mot pour mot. Analyser, interpréter, hiérarchiser.

Structure :
1. Contexte de l'acheteur (2-3 phrases) : sa situation, ses contraintes institutionnelles ou sectorielles, ce que ce marché représente pour lui — s'appuyer sur des éléments factuels de l'AO
2. Besoins explicites identifiés (3-4 points) : exigences directement formulées dans le CDC, reformulées avec ta propre analyse. Chaque point doit citer un élément spécifique du texte de l'AO (entre guillemets si exact)
3. Besoins implicites (2-3 points) : ce que l'AO ne dit pas mais que le contexte laisse deviner — signalés clairement comme inférences : "cela laisse supposer…", "ce contexte implique probablement…"
4. Points de vigilance (2 max) : risques ou contraintes spécifiques à ce marché, justifiés par des éléments concrets du CDC
5. Convergence (1-2 phrases) : comment les expertises de l'entreprise répondent précisément à ces enjeux — ancré dans les données du profil disponibles

Interdit :
- Toute liste de besoins copiée-collée de l'AO
- Mélanger besoins certains et inférences sans les distinguer
- "Vous avez besoin d'une solution adaptée…" et assimilés
""",
    ),
    SectionConfig(
        titre="Notre approche méthodologique",
        titre_en="Our Methodological Approach",
        role="directeur technique senior présentant une méthodologie concrète, séquencée et adaptée à ce marché",
        focus="Convaincre que la mission sera exécutée avec rigueur en montrant une démarche opérationnelle réaliste, calée sur les contraintes de CET AO.",
        min_mots=380,
        max_mots=520,
        instructions="""
RÈGLE ABSOLUE : La méthodologie doit être cohérente avec le périmètre, les délais et les exigences spécifiques de l'AO. Ne pas inventer de phases ou durées non justifiables par le CDC.

Structure :
1. Principe directeur (1 phrase) : le fil conducteur méthodologique choisi pour CET AO — pourquoi cette approche est la plus adaptée à ce contexte précis
2. Phases de la mission (tableau Markdown OBLIGATOIRE) :
| Phase | Durée indicative | Activités clés | Livrables |
|---|---|---|---|
Si les délais ne sont pas précisés : utiliser des durées relatives (J+0 à J+30, J+30 à J+60…)
3. Points différenciants (2-3 points) : ce qui distingue l'approche — directement liés aux contraintes identifiées dans l'AO, pas génériques
4. Gestion des risques (1-2 points) : risques spécifiques à ce marché identifiés dans le CDC et mécanismes de mitigation
5. Contrôle qualité (1 point) : jalons de validation, reporting, mécanismes de suivi

Interdit :
- Méthodologies génériques non ancrées dans l'AO
- Outils ou frameworks non cohérents avec les expertises déclarées dans le profil
- Durées précises sans base dans l'AO
- "Notre approche sur mesure" et assimilés sans les détailler
""",
    ),
    SectionConfig(
        titre="Moyens humains et techniques mobilisés",
        titre_en="Human and Technical Resources",
        role="directeur des opérations présentant le dispositif de ressources dimensionné pour ce marché",
        focus="Rassurer l'acheteur sur la capacité de livraison avec un dispositif humain et technique crédible, dimensionné pour ce marché et justifié par le profil.",
        min_mots=280,
        max_mots=420,
        instructions="""
RÈGLE ABSOLUE : Ne pas inventer de profils, certifications, noms ou effectifs. Si le profil entreprise est limité, présenter des "profils mobilisables" ou une "équipe type" cohérente avec les expertises déclarées, en les signalant explicitement comme tels.

Si l'AO spécifie des ressources minimales exigées : y répondre point par point en introduction avant le tableau.

Structure :
1. Introduction (1-2 phrases) : comment le dispositif est dimensionné par rapport aux exigences de l'AO
2. Équipe projet (tableau Markdown OBLIGATOIRE) :
| Profil | Expérience indicative | Certifications | Rôle sur ce marché |
|---|---|---|---|
Ne mentionner que les certifications présentes dans le profil. Mettre "—" pour les colonnes sans données.
3. Moyens techniques (liste courte) : uniquement si pertinent pour ce marché — logiciels, équipements, infrastructures mentionnés dans les expertises du profil
4. Organisation (1-2 phrases) : dédié vs mutualisé, mode de mobilisation, disponibilité

Interdit :
- Certifications non listées dans le profil
- Noms de collaborateurs inventés
- Effectifs non fournis dans le profil
""",
    ),
    SectionConfig(
        titre="Références similaires",
        titre_en="Relevant References",
        role="directeur commercial présentant les réalisations représentatives avec honnêteté et précision",
        focus="Démontrer par des réalisations concrètes la capacité à réussir ce marché — sans exagération, sans invention, avec les données disponibles seulement.",
        min_mots=280,
        max_mots=400,
        instructions="""
RÈGLE ABSOLUE ET STRICTE — ANTI-HALLUCINATION :
Ne jamais inventer un client, un budget, un délai, un résultat ou un taux de satisfaction.
Tous les chiffres et noms de clients doivent être extraits du profil entreprise.
Si une colonne n'a pas de données : mettre "—" ou "Données à préciser".

CAS 1 — Des références sont disponibles dans le profil :
Tableau Markdown OBLIGATOIRE :
| Client | Mission | Périmètre / Budget | Résultat notable |
|---|---|---|---|
Ne compléter que les colonnes pour lesquelles les données existent.
Après le tableau : 2 phrases reliant ces références aux exigences spécifiques de l'AO.

CAS 2 — Références insuffisantes ou absentes :
Ne pas inventer de missions. Rédiger à la place une section "Capacité à répondre" qui :
- argumente sur la transférabilité des expertises déclarées vers ce marché
- cite les secteurs d'intervention et méthodologies maîtrisées
- reconnaît sobrement la limitation si nécessaire, de façon professionnelle

Interdit absolu :
- Clients, budgets, délais ou résultats non présents dans le profil
- "Nos références parlent d'elles-mêmes" sans en donner
""",
    ),
    SectionConfig(
        titre="Planning prévisionnel",
        titre_en="Project Timeline",
        role="chef de projet PMO présentant un planning réaliste, structuré et cohérent avec les délais de l'AO",
        focus="Proposer un planning crédible, aligné sur les contraintes de l'AO, qui rassure concrètement sur la maîtrise des délais.",
        min_mots=250,
        max_mots=380,
        instructions="""
RÈGLE ABSOLUE : Toutes les dates et durées doivent être cohérentes avec les informations de l'AO.
Si la date de démarrage ou de livraison finale n'est pas précisée : utiliser des durées relatives (J+0, J+30, J+60…).
Si une date contractuelle est mentionnée dans l'AO : elle doit apparaître explicitement dans le tableau.

Structure :
1. Planning phases (tableau Markdown OBLIGATOIRE) :
| Phase | Début | Durée | Livrables | Jalon client |
|---|---|---|---|---|
Inclure une ligne "Marge / Buffer" si le planning est tendu.

2. Points critiques (2-3 phrases) : dépendances inter-phases, conditions de respect des délais côté acheteur (accès aux données, validation rapide…), risques calendaires

3. Engagement de délai (1 phrase) : formulation claire de l'engagement, conditionnée aux éléments qui en dépendent

Interdit :
- Dates de démarrage précises si non fournies dans l'AO
- Planning irréaliste par rapport au périmètre décrit
""",
    ),
    SectionConfig(
        titre="Proposition financière",
        titre_en="Financial Proposal",
        role="directeur financier qui valorise l'offre par la transparence et le rapport valeur/coût",
        focus="Rendre l'offre lisible et convaincante en valorisant la valeur générée et la maîtrise du risque — sans inventer de prix ni de montants.",
        min_mots=280,
        max_mots=420,
        instructions="""
RÈGLE ABSOLUE :
- Ne jamais inventer un montant, un taux horaire ou un coût total si ces éléments ne figurent pas dans le profil ou l'AO.
- Le prix est fixé par la direction de l'entreprise. Cette section valorise la valeur, elle ne fixe pas le prix.
- Si le budget de l'AO est connu : aligner la présentation sur ce budget.
- Si le budget n'est pas connu : ne donner aucun chiffre précis — valoriser la transparence et la lisibilité.

Structure :
1. Structure de l'offre (tableau Markdown OBLIGATOIRE si budget AO connu) :
| Composante | Description | Unité | Remarque |
|---|---|---|---|
Si budget inconnu : liste des composantes sans montants, avec explication du mode de calcul.

2. Valeur générée pour l'acheteur (2-3 points) : gains concrets argumentables avec les données disponibles uniquement.

3. Tableau ROI/TCO — uniquement si des éléments dans l'AO ou le profil le justifient :
| Indicateur | Situation actuelle | Avec notre solution | Horizon |
Mettre "À préciser en phase de cadrage" pour les inconnues.

4. Transparence et conditions (1 point) : mode de facturation, jalons de paiement, garanties — si connus

Interdit absolu :
- Montants ou taux horaires non fournis
- "Nos prix sont compétitifs" sans données
- Engagements contractuels précis non validés par la direction
""",
    ),
    SectionConfig(
        titre="Conclusion et engagements",
        titre_en="Conclusion and Commitments",
        role="dirigeant de l'entreprise s'engageant personnellement sur la réussite de ce marché",
        focus="Conclure de façon mémorable avec des engagements fermes, mesurables et cohérents avec ce qui a été présenté — pas des formules de politesse.",
        min_mots=180,
        max_mots=300,
        instructions="""
RÈGLE ABSOLUE : Les engagements doivent être cohérents avec la méthodologie et le planning présentés dans les sections précédentes. Ne pas prendre d'engagements non étayés.

Structure :
1. Synthèse différenciante (3 points) : les 3 raisons concrètes et spécifiques de choisir cette entreprise pour CET AO — chaque point ancré dans un élément du CDC ou des critères de sélection. Pas de raisons génériques.
2. Engagements mesurables (2-3 points) : délais, qualité, disponibilité, reporting — avec des indicateurs concrets quand possible
3. Prochaine étape (1-2 phrases) : action concrète et facile pour l'acheteur (réunion de lancement, présentation technique, démonstration…)
4. Formule de clôture : directe, engagée, professionnelle. Jamais "restant à votre entière disposition" ni "en espérant une suite favorable"

Interdit :
- Les 3 raisons génériques applicables à n'importe quel AO
- Engagements contradictoires avec la méthodologie ou le planning
- Formules bureaucratiques de fin de lettre
""",
    ),
]


# ── Service ────────────────────────────────────────────────────────────────

class PromptBuilderService:
    """
    Service de construction des prompts pour la génération en 2 phases.

    Phase 1 : build_brief_prompt()   → brief stratégique (1 appel LLM)
    Phase 2 : build_section_prompt() → 1 appel par section (en parallèle)

    Nouveautés v2 :
    - Blocs de contexte signalent explicitement les données manquantes
    - Formules creuses explicitement interdites dans les system prompts
    - Auto-vérification silencieuse avant chaque génération
    - Brief injecté comme boussole active avec instructions d'application
    - Règle ABSOLUE anti-hallucination dans chaque section à risque
    """

    _EXPERT_ROLE_FR = (
        "Tu es un expert senior en rédaction de réponses aux appels d'offres, "
        "avec 15 ans d'expérience dans le conseil et les marchés publics et privés. "
        "Tu rédiges des réponses précises, ancrées dans le cahier des charges, "
        "personnalisées à l'acheteur, et conçues pour maximiser la note sur les critères d'évaluation. "
        "Tu distingues toujours les données certaines, les inférences plausibles et les informations absentes. "
        "Tu n'inventes jamais de faits précis — clients, chiffres, certifications, budgets, délais passés."
    )
    _EXPERT_ROLE_EN = (
        "You are a senior expert in writing tender responses, "
        "with 15 years of experience in consulting and public/private procurement. "
        "You write precise, CDC-anchored, buyer-tailored responses "
        "designed to maximise scores on evaluation criteria. "
        "You always distinguish between certain data, plausible inferences, and missing information. "
        "You never invent specific facts — clients, figures, certifications, budgets, past deadlines."
    )

    _FORMAT_RULES_FR = (
        "---\n"
        "## RÈGLES DE FORMAT — NON NÉGOCIABLES\n"
        "- Rédige en Markdown propre : gras (`**…**`), listes à puces, tableaux.\n"
        "- Ne commence JAMAIS ta réponse par le titre de la section.\n"
        "- N'ajoute aucun méta-commentaire sur les instructions reçues ni de phrase d'introduction du type \"Dans cette section, je vais…\"\n"
        "- Tous les tableaux doivent être utiles et exploitables — jamais décoratifs.\n"
        "- Syntaxe tableau : `| Col A | Col B |\\n|---|---|\\n| val | val |`\n"
        f"- FORMULES INTERDITES (ne jamais utiliser) : {_CLICHES_FR}"
    )
    _FORMAT_RULES_EN = (
        "---\n"
        "## FORMAT RULES — NON-NEGOTIABLE\n"
        "- Write clean Markdown: bold (`**…**`), bullet points, tables.\n"
        "- NEVER start your response with the section heading.\n"
        "- Add no meta-commentary about instructions received.\n"
        "- All tables must be useful and actionable — never decorative.\n"
        "- Table syntax: `| Col A | Col B |\\n|---|---|\\n| val | val |`\n"
        f"- FORBIDDEN PHRASES (never use): {_CLICHES_EN}"
    )

    _AUTO_CHECK_FR = (
        "---\n"
        "## AUTO-VÉRIFICATION SILENCIEUSE — avant de finaliser\n"
        "Coche mentalement chaque point. Corrige si nécessaire. N'écris pas cette checklist dans ta réponse.\n\n"
        "☐ Longueur dans la fourchette demandée\n"
        "☐ Tableaux obligatoires présents et correctement formatés\n"
        "☐ Aucun titre de section en début de texte\n"
        "☐ Aucun méta-commentaire sur les instructions\n"
        "☐ Aucune donnée inventée (client, budget, chiffre, certification absents du profil)\n"
        "☐ Chaque point ancré dans un élément spécifique de l'AO ou du profil\n"
        "☐ Brief stratégique respecté (ton, messages porteurs, priorités)\n"
        "☐ Aucune répétition de contenu traité dans d'autres sections\n"
        "☐ Aucune formule creuse de la liste interdite"
    )
    _AUTO_CHECK_EN = (
        "---\n"
        "## SILENT SELF-CHECK — before finalising\n"
        "Mentally check each point. Correct if needed. Do NOT write this checklist in your response.\n\n"
        "☐ Length within requested range\n"
        "☐ Required tables present and correctly formatted\n"
        "☐ No section heading at the start\n"
        "☐ No meta-commentary about instructions\n"
        "☐ No invented data (client, budget, figure, certification not in profile)\n"
        "☐ Each point anchored in a specific AO or profile element\n"
        "☐ Strategic brief respected (tone, key messages, priorities)\n"
        "☐ No repetition of content already covered in other sections\n"
        "☐ No forbidden generic phrases"
    )

    def _expert_role(self, langue: str) -> str:
        return self._EXPERT_ROLE_EN if langue == "en" else self._EXPERT_ROLE_FR

    def _format_rules(self, langue: str) -> str:
        return self._FORMAT_RULES_EN if langue == "en" else self._FORMAT_RULES_FR

    def _auto_check(self, langue: str) -> str:
        return self._AUTO_CHECK_EN if langue == "en" else self._AUTO_CHECK_FR

    def _langue_instruction(self, langue: str) -> str:
        if langue == "en":
            return "---\n## LANGUAGE\nWrite the entire response **in English**."
        return ""

    def _section_titre(self, section: SectionConfig, langue: str) -> str:
        return section.titre_en if langue == "en" else section.titre

    def get_sections(self) -> list[SectionConfig]:
        return SECTIONS

    # ── Prompts principaux ─────────────────────────────────────────────────

    def build_brief_prompt(
        self,
        ao: AppelOffre,
        request: GenerationRequest,
    ) -> tuple[str, str]:
        """
        Phase 1 — Brief stratégique.

        Produit un document interne qui établit le fil rouge de toute la réponse :
        enjeux réels, points forts à valoriser, messages porteurs, lacunes identifiées.

        Returns:
            Tuple (system_prompt, user_prompt).
        """
        langue = request.langue

        system = (
            self._expert_role(langue) + "\n\n"
            + (
                "You analyse a tender and produce a strategic brief that will guide every section of the response. "
                "Be honest about missing data — identify gaps explicitly rather than working around them silently."
                if langue == "en" else
                "Tu analyses un appel d'offres et produis un brief stratégique qui guidera chaque section de la réponse. "
                "Sois honnête sur les données manquantes — identifie les lacunes explicitement plutôt que de les contourner silencieusement."
            )
        )

        if langue == "en":
            brief_instruction = f"""---
## YOUR TASK: STRATEGIC BRIEF (max 450 words)

This brief will be injected into every section prompt as the response compass.
Structure EXACTLY as follows:

**1. KEY STAKES** (3 points max)
The buyer's real underlying needs beyond the explicit requirements.
What does failure on this market cost them? What does success look like?

**2. COMPANY STRENGTHS TO LEVERAGE** (3 points max)
Most relevant strengths for THIS tender — each directly linked to a need or criterion.
If the profile lacks specific data: note explicitly "Data to confirm: …"

**3. KEY MESSAGES TO WEAVE THROUGH ALL SECTIONS** (2-3)
Short, concrete, differentiating — not slogans.
Example: "Dedicated team, not pooled resources." / "Delivery guaranteed by [date]."

**4. TONE AND POSITIONING**
How to write (analytical / reassuring / expert) and which pitfalls to avoid.

**5. SECTION PRIORITY STRATEGY**
Based on evaluation criteria and weights — which sections deserve most development?
IMPORTANT: high price weight does NOT mean expanding the financial section.
The price is set by management. Instead: reinforce ROI and risk-reduction arguments in ALL technical sections.
If no criteria specified: prioritise methodology, references, human resources.

**6. IDENTIFIED DATA GAPS**
List missing information from the company profile that would strengthen the response.
Be explicit — this calibrates generation to avoid hallucinations.

{self._format_rules(langue)}

Write the brief in English."""
        else:
            brief_instruction = f"""---
## TA MISSION : BRIEF STRATÉGIQUE INTERNE (450 mots maximum)

Ce brief sera injecté dans chaque prompt de section comme boussole de la réponse.
Structure EXACTEMENT ainsi :

**1. ENJEUX CLÉS** (3 points max)
Les besoins réels de l'acheteur au-delà des exigences explicites.
Qu'est-ce qu'un échec sur ce marché leur coûte ? À quoi ressemble le succès pour eux ?

**2. POINTS FORTS À VALORISER** (3 points max)
Les atouts les plus pertinents de l'entreprise pour CET AO — chacun directement relié à un besoin ou critère.
Si le profil manque de données précises : signaler "Donnée à confirmer : …"

**3. MESSAGES PORTEURS À TISSER DANS TOUTES LES SECTIONS** (2-3)
Courts, concrets, différenciants — pas des slogans.
Exemple : "Équipe dédiée, non mutualisée." / "Livraison garantie avant [date]."

**4. TON ET POSITIONNEMENT**
Comment écrire (analytique / rassurant / expert) et quels pièges éviter.

**5. STRATÉGIE DE PONDÉRATION DES SECTIONS**
En fonction des critères d'évaluation et de leurs poids, quelles sections méritent le plus de développement ?
IMPORTANT : un poids élevé sur le Prix ne signifie PAS développer la section financière.
Le prix est fixé par la direction. En revanche : renforcer l'argumentation ROI et réduction du risque dans TOUTES les sections techniques.
Si aucun critère n'est précisé : prioriser méthodologie, références et moyens humains.

**6. LACUNES IDENTIFIÉES**
Lister les informations absentes du profil qui affaiblissent la réponse.
Être explicite : cela calibre la génération pour éviter les hallucinations.

{self._format_rules(langue)}"""

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
        Phase 2 — Prompt d'une section spécifique.

        Le brief stratégique est injecté comme boussole active avec instructions
        d'application explicites.

        Returns:
            Tuple (system_prompt, user_prompt).
        """
        langue = request.langue
        titre  = self._section_titre(section, langue)

        if langue == "en":
            system = (
                f"{self._expert_role(langue)}\n\n"
                f"You are writing the \"{titre}\" section of a tender response. "
                f"For this section, you play the role of: {section.role}.\n\n"
                f"{self._format_rules(langue)}"
            )
            closing = f"""---
## SECTION TO WRITE: "{titre}"

**Objective:** {section.focus}

**Target length:** {section.min_mots} to {section.max_mots} words.

**Detailed instructions:**
{section.instructions}

---
**USE THE STRATEGIC BRIEF AS YOUR COMPASS:**
- Apply its key messages in this section
- Respect the tone and positioning defined
- Do not repeat content already covered in other sections
- If the brief identified data gaps: adapt the text accordingly — never fill gaps with invented data

{self._auto_check(langue)}

Write ONLY the section content in rich Markdown.
Do NOT include the heading "## {titre}".
Write in English."""
        else:
            system = (
                f"{self._expert_role(langue)}\n\n"
                f"Tu rédiges la section « {titre} » d'une réponse à appel d'offres. "
                f"Pour cette section, tu joues le rôle du : {section.role}.\n\n"
                f"{self._format_rules(langue)}"
            )
            closing = f"""---
## SECTION À RÉDIGER : « {titre} »

**Objectif :** {section.focus}

**Longueur cible :** {section.min_mots} à {section.max_mots} mots.

**Instructions détaillées :**
{section.instructions}

---
**UTILISE LE BRIEF STRATÉGIQUE COMME BOUSSOLE :**
- Applique ses messages porteurs dans cette section
- Respecte le ton et le positionnement définis
- Ne répète pas le contenu déjà traité dans d'autres sections
- Si le brief a identifié des lacunes de données : adapte le texte en conséquence — ne comble jamais une lacune avec des données inventées

{self._auto_check(langue)}

Rédige UNIQUEMENT le contenu de la section en Markdown enrichi.
N'inclus PAS le titre « ## {titre} »."""

        user = "\n\n".join(filter(None, [
            self._bloc_ao(ao),
            self._bloc_entreprise(request.contexte_entreprise),
            self._bloc_criteres(ao),
            self._bloc_brief(brief, langue),
            rag_context or None,
            self._bloc_instructions_sup(request),
            self._langue_instruction(langue),
            closing,
        ]))

        return system, user

    # ── Blocs de contexte ──────────────────────────────────────────────────

    def _bloc_ao(self, ao: AppelOffre) -> str:
        """Données AO — champs manquants signalés explicitement."""
        lignes = ["---", "## APPEL D'OFFRES — DONNÉES CERTAINES", f"**Titre :** {ao.titre}"]
        if ao.reference:
            lignes.append(f"**Référence :** {ao.reference}")
        if ao.acheteur:
            lignes.append(f"**Acheteur :** {ao.acheteur}")
        if ao.budget_estime:
            lignes.append(f"**Budget estimé :** {ao.budget_estime:,.0f} €")
        else:
            lignes.append("**Budget :** non précisé dans l'AO — ne pas inventer de montant")
        if ao.date_limite:
            lignes.append(f"**Date limite de remise :** {ao.date_limite}")
        else:
            lignes.append("**Date limite :** non précisée — utiliser des durées relatives")
        lignes.append(f"**Type de marché :** {ao.type_marche.value}")
        lignes.append(f"\n**Description complète :**\n{ao.description_globale[:2000]}")
        if ao.sections:
            lignes.append("\n**Sections identifiées dans le cahier des charges :**")
            for s in ao.sections[:6]:
                lignes.append(f"- **{s.titre}** : {s.contenu[:200]}…")
        return "\n".join(lignes)

    def _bloc_entreprise(self, ctx) -> str:
        """Profil entreprise — champs vides signalés avec instruction explicite."""
        lignes = [
            "---",
            "## PROFIL ENTREPRISE — DONNÉES DISPONIBLES",
            "⚠️ Utilise UNIQUEMENT les données ci-dessous. "
            "Pour tout champ marqué 'non renseigné' : adapte le texte sans inventer de précision.",
            f"\n**Raison sociale :** {ctx.nom}",
        ]

        if ctx.description:
            lignes.append(f"**Description :** {ctx.description}")
        else:
            lignes.append("**Description :** non renseignée")

        if ctx.expertises:
            exp = ctx.expertises if isinstance(ctx.expertises, str) else ", ".join(ctx.expertises)
            lignes.append(f"**Expertises :** {exp}")
        else:
            lignes.append("**Expertises :** non renseignées")

        secteurs = getattr(ctx, "secteurs", None)
        if secteurs:
            sec = secteurs if isinstance(secteurs, str) else ", ".join(secteurs)
            lignes.append(f"**Secteurs :** {sec}")

        certifications = getattr(ctx, "certifications", None)
        if certifications:
            cert = certifications if isinstance(certifications, str) else ", ".join(certifications)
            lignes.append(f"**Certifications :** {cert}")
        else:
            lignes.append("**Certifications :** non renseignées — ne JAMAIS en mentionner")

        if ctx.references:
            lignes.append("**Références projets (utiliser telles quelles, sans modification) :**")
            refs = (
                ctx.references if isinstance(ctx.references, list)
                else [r.strip() for r in ctx.references.split("\n") if r.strip()]
            )
            for ref in refs[:6]:
                lignes.append(f"  - {ref}")
        else:
            lignes.append("**Références :** non renseignées — ne JAMAIS inventer de missions ou clients")

        if ctx.effectif:
            lignes.append(f"**Effectif :** {ctx.effectif} collaborateurs")
        else:
            lignes.append("**Effectif :** non renseigné — ne JAMAIS inventer ce chiffre")

        if ctx.chiffre_affaires:
            lignes.append(f"**Chiffre d'affaires :** {ctx.chiffre_affaires}")
        else:
            lignes.append("**Chiffre d'affaires :** non renseigné — ne JAMAIS inventer ce chiffre")

        if getattr(ctx, "adresse", None) or getattr(ctx, "ville", None):
            lignes.append(
                f"**Localisation :** {', '.join(filter(None, [getattr(ctx, 'adresse', ''), getattr(ctx, 'ville', '')]))}"
            )

        return "\n".join(lignes)

    def _bloc_criteres(self, ao: AppelOffre) -> str:
        """Critères de sélection avec stratégie d'adressage explicite."""
        if not ao.criteres:
            return (
                "---\n## CRITÈRES DE SÉLECTION\n"
                "Critères non précisés dans l'AO.\n"
                "Stratégie par défaut : prioriser la méthodologie, la compréhension du besoin et les références."
            )
        lignes = [
            "---",
            "## CRITÈRES DE SÉLECTION — À ADRESSER IMPÉRATIVEMENT",
            "Chaque section doit contribuer à améliorer la note sur les critères pertinents.\n",
        ]
        for c in ao.criteres:
            ligne = f"- **{c.nom}** ({c.ponderation}%)"
            if c.description:
                ligne += f" : {c.description}"
            lignes.append(ligne)
        lignes.append(
            "\n💡 Rappel : un poids élevé sur le Prix ne signifie pas développer la section financière. "
            "Cela signifie renforcer l'argumentation ROI et réduction du risque dans toutes les sections techniques."
        )
        return "\n".join(lignes)

    def _bloc_brief(self, brief: str, langue: str) -> str:
        """Brief stratégique injecté comme boussole active."""
        if langue == "en":
            return (
                "---\n## STRATEGIC BRIEF — READ BEFORE WRITING\n\n"
                f"{brief}\n\n"
                "⚡ Apply the key messages, tone, and priorities above. "
                "If gaps were identified, never fill them with invented data."
            )
        return (
            "---\n## BRIEF STRATÉGIQUE — À LIRE AVANT DE RÉDIGER\n\n"
            f"{brief}\n\n"
            "⚡ Applique les messages porteurs, le ton et les priorités ci-dessus. "
            "Si des lacunes ont été identifiées, ne les comble jamais avec des données inventées."
        )

    def _bloc_instructions_sup(self, request: GenerationRequest) -> str:
        if not request.instructions_supplementaires:
            return ""
        return f"---\n## INSTRUCTIONS ADDITIONNELLES\n{request.instructions_supplementaires}"
