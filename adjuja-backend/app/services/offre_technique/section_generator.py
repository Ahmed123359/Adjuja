"""
Générateur de sections pour l'offre technique.
Structure : 6 sections générées par LLM (sections 3, 4, 5, 6, 7-planning, 8-RSE).
Sections structurées (équipe, chronogramme) sont assemblées dans doc_assembler.
"""
import asyncio
import json
import logging
import httpx

from app.models.offre_technique import CPSContext, RCContext, StrategyAngle
from app.services.offre_technique.prompts import SECTION_SYSTEMS

logger = logging.getLogger(__name__)

_MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"
_MODEL       = "mistral-large-latest"
_TIMEOUT     = 120
_RETRY_DELAYS = (15, 45, 90)

# Sections générées par LLM (dans l'ordre du document)
SECTION_NAMES = [
    "presentation_cabinet",   # Section 3  Cabinet + références
    "comprehension_contexte", # Section 4  Contexte national/sectoriel
    "comprehension_mission",  # Section 5  Objectifs, livrables, périmètre
    "methodologie",           # Section 6  Approche méthodologique
    "planning",               # Section 8  Planning JSON (phases, Gantt)
    "rse",                    # Démarche RSE
]


def _build_rc_block(section: str, rc: RCContext | None) -> str:
    if not rc or not rc.criteres:
        return ""

    section_map = {
        "methodologie":           ["methodologie", "méthode", "approche", "technique"],
        "presentation_cabinet":   ["reference", "référence", "experience", "expérience", "cabinet"],
        "comprehension_contexte": ["contexte", "compréhension", "diagnostic"],
        "comprehension_mission":  ["mission", "compréhension", "objectif"],
        "planning":               ["planning", "calendrier", "delai", "délai", "chronogramme"],
        "rse":                    ["rse", "développement durable", "environnement", "social"],
    }

    lines = ["", "Grille de notation du jury (RC)  optimise le contenu pour maximiser le score :"]
    for c in rc.criteres:
        nom   = c.get("nom", "")
        pts   = c.get("points", 0)
        elim  = c.get("eliminatoire", 0)
        elim_txt = f" (note éliminatoire : {elim})" if elim else ""
        lines.append(f"- {nom} : {pts} points{elim_txt}")

    keywords = section_map.get(section, [])
    section_pts = next(
        (c.get("points", 0) for c in rc.criteres
         if any(k in c.get("nom", "").lower() for k in keywords)),
        0,
    )
    if section_pts:
        lines.append(f"\nCette section est notée sur {section_pts} points.")

    if rc.plan_impose and section == "methodologie":
        lines += ["", "Plan imposé par le RC (respecter cet ordre) :"]
        lines += [f"  {i+1}. {s}" for i, s in enumerate(rc.plan_impose)]

    nb_pages = rc.nb_pages_max.get(section)
    if nb_pages:
        lines.append(f"Nombre de pages maximum : {nb_pages}.")

    if section == "presentation_cabinet" and rc.format_references:
        lines += ["", f"Format fiches références imposé par le RC : {rc.format_references}"]

    return "\n".join(lines)


def _build_user_prompt(
    section: str,
    cps: CPSContext,
    angle: StrategyAngle,
    company_info: dict,
    rag_context: str,
    team_members: list[dict] | None = None,
    rc: RCContext | None = None,
    custom_instructions: str | None = None,
) -> str:
    parts = [
        f"ANGLE NARRATIF : {angle.angle}  {angle.narrative}",
        f"Différenciateurs clés : {', '.join(angle.differentiators)}",
        "",
        "=== INFORMATIONS DU CPS (vocabulaire à réutiliser tel quel) ===",
        f"Intitulé exact du marché : {getattr(cps, 'intitule', cps.scope)}",
        f"Maître d'Ouvrage : {cps.acheteur}",
        f"Référence AO : {cps.reference or 'non précisée'}",
        f"Objet / Scope : {cps.scope}",
        f"Délai d'exécution : {cps.delais}",
        f"Contexte national : {getattr(cps, 'contexte_national', '')}",
        f"Objectifs spécifiques : {', '.join(getattr(cps, 'objectifs_specifiques', []))}",
        f"Livrables obligatoires : {', '.join(cps.livrables) if cps.livrables else 'non précisés'}",
        f"Exigences intervenants : {cps.exigences_formateurs}",
        f"Vocabulaire clé du MO : {', '.join(getattr(cps, 'vocabulaire_cle', []))}",
        "",
        "=== PROFIL DU CABINET ===",
        json.dumps(company_info, ensure_ascii=False, indent=2),
    ]

    if team_members:
        lines = [
            "",
            "=== ÉQUIPE AFFECTÉE À CETTE MISSION ===",
            "Expert | Poste | Spécialité | Diplôme | Expérience",
        ]
        for m in team_members:
            cv = m.get("cv") or {}
            nom = f"{cv.get('nom', '')} {cv.get('prenom', '')}".strip() or "Expert"
            lines.append(
                f"- {nom} | {m.get('role_dans_offre', cv.get('poste', ''))} "
                f"| {cv.get('specialite', '')} | {cv.get('diplome', '')} "
                f"| {cv.get('annees_experience', '')} ans"
            )
            if m.get("warning"):
                lines.append(f"  [ATTENTION: profil requis '{m.get('profil_requis_ref', '')}' sans CV associé]")
        parts.extend(lines)

    rc_block = _build_rc_block(section, rc)
    if rc_block:
        parts.append(rc_block)

    if rag_context:
        parts += ["", "=== RÉFÉRENCES ET CONTEXTE RAG (utiliser ces données réelles) ===", rag_context]

    if custom_instructions:
        parts += [
            "",
            "=== INSTRUCTIONS SPÉCIFIQUES DU SOUMISSIONNAIRE ===",
            f"<instructions>\n{custom_instructions}\n</instructions>",
        ]

    return "\n".join(parts)


async def _call_mistral(system: str, user: str, api_key: str, json_mode: bool = False) -> str:
    payload: dict = {
        "model":       _MODEL,
        "messages":    [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "temperature": 0.65,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for attempt, delay in enumerate((*_RETRY_DELAYS, None), start=1):
            resp = await client.post(
                _MISTRAL_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
            if resp.status_code != 429 or delay is None:
                break
            logger.warning("Rate limit Mistral (attempt %d), waiting %ds", attempt, delay)
            await asyncio.sleep(delay)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


async def generate_all(
    cps: CPSContext,
    angle: StrategyAngle,
    company_info: dict,
    api_key: str,
    rag_contexts: dict[str, str] | None = None,
    custom_instructions: str | None = None,
    rc: RCContext | None = None,
    team_members: list[dict] | None = None,
    existing: dict[str, str] | None = None,
) -> dict[str, str]:
    rag_contexts = rag_contexts or {}
    existing     = existing or {}

    missing = [s for s in SECTION_NAMES if s not in existing]
    if not missing:
        return {}

    async def gen(section: str) -> tuple[str, str]:
        user = _build_user_prompt(
            section, cps, angle, company_info,
            rag_context=rag_contexts.get(section, ""),
            team_members=team_members,
            rc=rc,
            custom_instructions=custom_instructions,
        )
        is_json = section == "planning"
        text = await _call_mistral(
            SECTION_SYSTEMS[section], user, api_key, json_mode=is_json
        )
        logger.info("Section '%s' générée (%d chars)", section, len(text))
        return section, text

    # Limiter la concurrence à 2 appels simultanés pour éviter le rate limit Mistral
    sem = asyncio.Semaphore(2)

    async def gen_limited(section: str) -> tuple[str, str]:
        async with sem:
            return await gen(section)

    results = await asyncio.gather(*[gen_limited(s) for s in missing], return_exceptions=True)

    sections: dict[str, str] = {}
    for r in results:
        if isinstance(r, Exception):
            raise r
        name, text = r
        sections[name] = text

    return sections
