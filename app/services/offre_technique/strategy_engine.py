import json
import re

import requests

from app.models.offre_technique import CPSContext, StrategyAngle
from app.services.offre_technique.prompts import STRATEGY_SYSTEM

_MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"
_MODEL       = "mistral-small-latest"


def choose_angle(cps: CPSContext, company_info: dict, api_key: str) -> StrategyAngle:
    user_prompt = (
        f"Profil entreprise :\n{json.dumps(company_info, ensure_ascii=False, indent=2)}\n\n"
        f"Contexte CPS :\n"
        f"- Scope : {cps.scope}\n"
        f"- Acheteur : {cps.acheteur}\n"
        f"- Critères : {json.dumps(cps.criteres, ensure_ascii=False)}\n"
        f"- Délais : {cps.delais}"
    )

    payload = {
        "model":           _MODEL,
        "messages":        [
            {"role": "system", "content": STRATEGY_SYSTEM},
            {"role": "user",   "content": user_prompt},
        ],
        "temperature":     0.3,
        "response_format": {"type": "json_object"},
    }
    resp = requests.post(
        _MISTRAL_URL,
        headers={"Authorization": f"Bearer {api_key}"},
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    raw = resp.json()["choices"][0]["message"]["content"]

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        data = json.loads(m.group(0)) if m else {}

    return StrategyAngle(
        angle=data.get("angle", "expertise"),
        narrative=data.get("narrative", ""),
        differentiators=data.get("differentiators", []),
    )
