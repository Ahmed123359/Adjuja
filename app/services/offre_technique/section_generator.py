import asyncio
import json
import re

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
        f"- Critères d'évaluation : {json.dumps(cps.criteres, ensure_ascii=False)}",
        "",
        f"Profil entreprise :",
        json.dumps(company_info, ensure_ascii=False, indent=2),
    ]
    if rag_context:
        parts += ["", rag_context]
    return "\n".join(parts)


async def _call_mistral(system: str, user: str, api_key: str) -> str:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            _MISTRAL_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model":       _MODEL,
                "messages":    [
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user},
                ],
                "temperature": 0.7,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


async def generate_all(
    cps: CPSContext,
    angle: StrategyAngle,
    company_info: dict,
    api_key: str,
    rag_contexts: dict[str, str] | None = None,
) -> dict[str, str]:
    rag_contexts = rag_contexts or {}

    async def gen(section: str) -> tuple[str, str]:
        user = _build_user_prompt(section, cps, angle, company_info, rag_contexts.get(section, ""))
        text = await _call_mistral(SECTION_SYSTEMS[section], user, api_key)
        return section, text

    results = await asyncio.gather(*[gen(s) for s in SECTION_NAMES], return_exceptions=True)

    sections: dict[str, str] = {}
    for r in results:
        if isinstance(r, Exception):
            raise r
        name, text = r
        sections[name] = text

    return sections
