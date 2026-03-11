import asyncio
import json
import logging
from app.providers.base import AbstractLLMProvider
from app.providers.provider_factory import ProviderFactory
from app.services.ao_parser_service import AOParserService
from app.services.prompt_builder_service import PromptBuilderService
from app.services.rag_service import RagService
from app.models.appel_offre import AppelOffre, Critere, TypeMarche
from app.models.generation import GenerationRequest, GenerationResult, SectionReponse
from app.config.settings import Settings

logger = logging.getLogger(__name__)

# Limites de tokens par appel
_BRIEF_MAX_TOKENS   = 600    # Brief stratégique : court et ciblé
_SECTION_MAX_TOKENS = 1000   # Chaque section : contenu riche
_PARSE_MAX_TOKENS   = 500    # Extraction JSON : réponse courte et structurée

# Modèles cheap par provider pour le parsing (évite de consommer des tokens sur le modèle principal)
_CHEAP_MODELS: dict[str, str] = {
    "openai":    "gpt-4o-mini",
    "anthropic": "claude-haiku-4-5-20251001",
    "mistral":   "mistral-small-latest",
}

_PARSE_SYSTEM = (
    "You are a structured data extraction assistant. Extract information from tender documents "
    "and return ONLY valid JSON, no explanation, no markdown formatting."
)

_PARSE_USER = """Extract fields from this tender document and return a JSON object with exactly these keys:
{{
  "titre": "short title of the tender",
  "reference": "reference number or empty string",
  "acheteur": "buying organization name or empty string",
  "type_marche": "TRAVAUX or FOURNITURES or SERVICES or MIXTE",
  "criteres": [{{"nom": "criterion name", "ponderation": numeric_percentage}}],
  "budget_estime": numeric_euros_or_null,
  "date_limite": "deadline date as string or empty string"
}}
Rules:
- criteres: include ONLY if explicit percentages or point weights appear in the document
- type_marche: TRAVAUX=construction/works, FOURNITURES=supplies/goods, SERVICES=services/consulting, MIXTE=mixed
- Return ONLY the JSON object, nothing else.

TENDER:
{texte}"""


class GenerationService:
    """
    Service d'orchestration de la génération multi-appels.

    Architecture en 2 phases :
    1. Brief stratégique (1 appel) — établit le fil rouge de la réponse
    2. Sections en parallèle (8 appels simultanés via asyncio.gather)
       chaque section reçoit un prompt spécialisé + le brief + contexte RAG

    Le RAG (Retrieval-Augmented Generation) enrichit chaque section avec
    des extraits pertinents issus de la base de connaissances interne.

    Pattern : injection de dépendances — chaque dépendance est passée
    au constructeur pour faciliter les tests unitaires.
    """

    def __init__(
        self,
        parser: AOParserService,
        prompt_builder: PromptBuilderService,
        settings: Settings,
        rag_service: RagService | None = None,
    ):
        self._parser = parser
        self._prompt_builder = prompt_builder
        self._settings = settings
        self._rag = rag_service

    async def generate(self, request: GenerationRequest) -> GenerationResult:
        """
        Génère une réponse AO complète via plusieurs appels LLM spécialisés.

        Étapes :
        1. Parse et structure l'AO brut
        2. Instancie le provider LLM
        3. Génère le brief stratégique (1 appel)
        4. Génère les 8 sections en parallèle (asyncio.gather)
        5. Assemble et retourne le GenerationResult final

        Args:
            request: Requête complète (AO, provider, modèle, contexte entreprise)

        Returns:
            GenerationResult avec sections structurées et texte complet assemblé
        """
        # Étape 1 : Parser l'AO (LLM cheap avec fallback regex)
        ao_parse = await self._parse_ao_with_llm(request)

        # Étape 2 : Créer le provider
        provider = self._creer_provider(request)

        # Étape 3 : Brief stratégique
        # wait_for lève asyncio.TimeoutError si le provider ne répond pas dans le délai.
        # On attrape cette exception séparément pour donner un message d'erreur précis.
        brief_sys, brief_usr = self._prompt_builder.build_brief_prompt(ao_parse, request)
        try:
            brief_text, brief_tokens = await asyncio.wait_for(
                provider.generate_text(brief_sys, brief_usr, _BRIEF_MAX_TOKENS, request.temperature),
                timeout=self._settings.llm_timeout_seconds,
            )
        except asyncio.TimeoutError:
            return GenerationResult(
                succes=False,
                provider_utilise=provider.provider_name,
                model_utilise=provider.current_model,
                erreur=(
                    f"Timeout : le brief stratégique n'a pas répondu en "
                    f"{self._settings.llm_timeout_seconds:.0f}s. Réessayez."
                ),
            )
        except Exception as e:
            return GenerationResult(
                succes=False,
                provider_utilise=provider.provider_name,
                model_utilise=provider.current_model,
                erreur=f"Erreur lors du brief stratégique : {e}",
            )

        # Étape 4 : Sections en parallèle (avec contexte RAG optionnel)
        sections_config = self._prompt_builder.get_sections()
        ao_context = f"{ao_parse.titre} {ao_parse.description_globale}"

        async def _gen_section(cfg):
            rag_context = ""
            if self._rag and self._rag.is_ready:
                rag_context = await self._rag.retrieve_for_section(cfg.titre, ao_context)

            sys_p, usr_p = self._prompt_builder.build_section_prompt(
                cfg, ao_parse, request, brief_text, rag_context=rag_context
            )
            # Timeout individuel par section : si une section bloque, elle ne retarde pas
            # les autres (les coroutines tournent en parallèle), mais elle échoue proprement.
            return await asyncio.wait_for(
                provider.generate_text(sys_p, usr_p, _SECTION_MAX_TOKENS, request.temperature),
                timeout=self._settings.llm_timeout_seconds,
            )

        try:
            section_results = await asyncio.gather(
                *[_gen_section(c) for c in sections_config],
                return_exceptions=True,
            )
        except Exception as e:
            return GenerationResult(
                succes=False,
                provider_utilise=provider.provider_name,
                model_utilise=provider.current_model,
                erreur=f"Erreur lors de la génération des sections : {e}",
            )

        # Vérifier si une section a levé une exception (TimeoutError ou autre)
        for i, res in enumerate(section_results):
            if isinstance(res, asyncio.TimeoutError):
                return GenerationResult(
                    succes=False,
                    provider_utilise=provider.provider_name,
                    model_utilise=provider.current_model,
                    erreur=(
                        f"Timeout : la section '{sections_config[i].titre}' n'a pas répondu en "
                        f"{self._settings.llm_timeout_seconds:.0f}s. Réessayez."
                    ),
                )
            if isinstance(res, Exception):
                return GenerationResult(
                    succes=False,
                    provider_utilise=provider.provider_name,
                    model_utilise=provider.current_model,
                    erreur=f"Erreur lors de la section '{sections_config[i].titre}' : {res}",
                )

        # Étape 5 : Assemblage
        sections: list[SectionReponse] = []
        total_tokens = brief_tokens
        full_text_parts: list[str] = []

        for i, (cfg, (texte, tokens)) in enumerate(zip(sections_config, section_results)):
            contenu = texte.strip()
            titre   = cfg.titre_en if request.langue == "en" else cfg.titre
            sections.append(SectionReponse(titre=titre, contenu=contenu, ordre=i))
            total_tokens += tokens
            full_text_parts.append(f"## {titre}\n\n{contenu}")

        return GenerationResult(
            succes=True,
            provider_utilise=provider.provider_name,
            model_utilise=provider.current_model,
            texte_complet="\n\n".join(full_text_parts),
            sections=sections,
            tokens_utilises=total_tokens,
            brief_strategique=brief_text,
        )

    async def generate_brief(self, request: GenerationRequest) -> dict:
        """
        Génère uniquement le brief stratégique (phase 1) sans déclencher les 8 sections.

        Utile pour valider la direction stratégique avant de lancer une génération complète.

        Returns:
            dict avec les clés :
              - brief_strategique (str)  : le brief produit par le LLM
              - provider_utilise  (str)  : provider effectivement utilisé
              - model_utilise     (str)  : modèle effectivement utilisé
              - tokens_utilises   (int)  : tokens consommés
        """
        ao_parse = await self._parse_ao_with_llm(request)
        provider = self._creer_provider(request)

        brief_sys, brief_usr = self._prompt_builder.build_brief_prompt(ao_parse, request)
        try:
            brief_text, brief_tokens = await asyncio.wait_for(
                provider.generate_text(brief_sys, brief_usr, _BRIEF_MAX_TOKENS, request.temperature),
                timeout=self._settings.llm_timeout_seconds,
            )
        except asyncio.TimeoutError:
            raise TimeoutError(
                f"Timeout : le brief n'a pas répondu en {self._settings.llm_timeout_seconds:.0f}s."
            )

        return {
            "brief_strategique": brief_text,
            "provider_utilise":  provider.provider_name,
            "model_utilise":     provider.current_model,
            "tokens_utilises":   brief_tokens,
        }

    async def _parse_ao_with_llm(self, request: GenerationRequest) -> AppelOffre:
        """
        Parse le texte brut de l'AO via un LLM cheap pour extraire les champs structurés.
        Fallback silencieux vers le parser regex en cas d'erreur.
        """
        try:
            provider_name = request.provider.value
            api_key_map: dict[str, str] = {
                "openai":    self._settings.openai_api_key,
                "anthropic": self._settings.anthropic_api_key,
                "mistral":   self._settings.mistral_api_key,
            }
            api_key = api_key_map.get(provider_name, "")
            cheap_model = _CHEAP_MODELS.get(provider_name, "")

            cheap_provider = ProviderFactory.create(
                provider_name=provider_name,
                api_key=api_key,
                model_name=cheap_model,
            )

            user_prompt = _PARSE_USER.format(texte=request.ao_texte[:3000])
            raw, _ = await asyncio.wait_for(
                cheap_provider.generate_text(_PARSE_SYSTEM, user_prompt, _PARSE_MAX_TOKENS, 0),
                timeout=30,
            )

            data = json.loads(raw.strip())
            ao = self._json_to_appel_offre(data, request.ao_texte)
            logger.info("AO parsé via LLM — titre=%r critères=%d", ao.titre, len(ao.criteres))
            return ao

        except Exception as e:
            logger.warning("LLM parse échoué (%s) — fallback regex", e)
            return self._parser.parse(request.ao_texte, max_chars=self._settings.ao_max_chars)

    def _json_to_appel_offre(self, data: dict, texte_brut: str) -> AppelOffre:
        """Construit un AppelOffre depuis le dict JSON extrait par le LLM."""
        criteres: list[Critere] = []
        for c in data.get("criteres", []):
            try:
                criteres.append(Critere(nom=str(c["nom"]), ponderation=float(c["ponderation"])))
            except (KeyError, ValueError, TypeError):
                continue

        try:
            type_marche = TypeMarche(data.get("type_marche", "MIXTE"))
        except ValueError:
            type_marche = TypeMarche.MIXTE

        try:
            budget = float(data["budget_estime"]) if data.get("budget_estime") is not None else None
        except (ValueError, TypeError):
            budget = None

        return AppelOffre(
            titre=str(data.get("titre", "") or "Appel d'offres"),
            reference=str(data.get("reference", "") or ""),
            acheteur=str(data.get("acheteur", "") or ""),
            type_marche=type_marche,
            description_globale=texte_brut[:self._settings.ao_max_chars],
            sections=[],
            criteres=criteres,
            budget_estime=budget,
            date_limite=str(data.get("date_limite", "") or ""),
            texte_brut=texte_brut,
        )

    def _creer_provider(self, request: GenerationRequest) -> AbstractLLMProvider:
        """Résout la clé API et instancie le provider via la factory."""
        provider_name = request.provider.value

        api_key_map: dict[str, str] = {
            "openai":    self._settings.openai_api_key,
            "anthropic": self._settings.anthropic_api_key,
            "mistral":   self._settings.mistral_api_key,
        }

        api_key = api_key_map.get(provider_name, "")
        if not api_key:
            raise ValueError(
                f"Clé API manquante pour le provider '{provider_name}'. "
                f"Vérifiez votre fichier .env."
            )

        return ProviderFactory.create(
            provider_name=provider_name,
            api_key=api_key,
            model_name=request.model or "",
        )
