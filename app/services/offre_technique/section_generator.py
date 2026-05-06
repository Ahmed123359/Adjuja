import asyncio
import json
import httpx

from app.models.offre_technique import CPSContext, StrategyAngle
from app.services.offre_technique.prompts import SECTION_SYSTEMS

_MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"
_MODEL       = "mistral-medium-latest"
_TIMEOUT     = 90

SECTION_NAMES = ["methodologie", "moyens", "planning", "rse", "references"]


def _build_user_prompt(
    section: str,
    cps: CPSContext,
    angle: StrategyAngle,
    company_info: dict,
    rag_context: str,
) -> str:
    parts = [
        f"Angle narratif : {angle.angle} — {angle.narrative}",
        f"Différenciateurs clés : {', '.join(angle.differentiators)}",
        "",
        f"Contexte du projet :",
        f"- Scope : {cps.scope}",
        f"- Acheteur : {cps.acheteur}",
        f"- Délais : {cps.delais}",
        f"- Nombre de sessions : {cps.nb_sessions}",
        f"- Horaire journalier : {cps.horaire}",
        f"- Critères d'évaluation : {json.dumps(cps.criteres, ensure_ascii=False)}",
        "",
        f"Obligations contractuelles OBLIGATOIRES à mentionner dans l'offre :",
        f"- Livrables : {', '.join(cps.livrables) if cps.livrables else 'non spécifiés'}",
        f"- Formateurs : {cps.exigences_formateurs}",
        f"- Planning : {cps.planning_note}",
        f"- Sous-traitance : {cps.sous_traitance}",
        "",
        f"Profil entreprise :",
        json.dumps(company_info, ensure_ascii=False, indent=2),
    ]
    if rag_context:
        parts += ["", rag_context]
    return "\n".join(parts)


_RETRY_DELAYS = (10, 30, 60)


async def _call_mistral(system: str, user: str, api_key: str,
                        json_mode: bool = False) -> str:
    payload: dict = {
        "model":       _MODEL,
        "messages":    [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "temperature": 0.7,
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
) -> dict[str, str]:
    rag_contexts = rag_contexts or {}

    async def gen(section: str) -> tuple[str, str]:
        user = _build_user_prompt(section, cps, angle, company_info, rag_contexts.get(section, ""))
        if custom_instructions:
            user += f"\n\nInstructions spécifiques du soumissionnaire :\n<user_instructions>\n{custom_instructions}\n</user_instructions>"
        text = await _call_mistral(SECTION_SYSTEMS[section], user, api_key,
                                   json_mode=(section == "planning"))
        return section, text

    results = await asyncio.gather(*[gen(s) for s in SECTION_NAMES], return_exceptions=True)

    sections: dict[str, str] = {}
    for r in results:
        if isinstance(r, Exception):
            raise r
        name, text = r
        sections[name] = text

    return sections
