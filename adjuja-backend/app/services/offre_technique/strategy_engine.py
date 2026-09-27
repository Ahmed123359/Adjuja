import json
import logging
import re


from app.models.offre_technique import CPSContext, StrategyAngle
from app.services.offre_technique.prompts import STRATEGY_SYSTEM
from app.services.offre_technique.llm import appeler_sync

logger = logging.getLogger(__name__)

_RETRY_DELAYS = (10, 30, 60)


def choose_angle(cps: CPSContext, company_info: dict, api_key: str) -> StrategyAngle:
    user_prompt = (
        f"Profil entreprise :\n{json.dumps(company_info, ensure_ascii=False, indent=2)}\n\n"
        f"Contexte CPS :\n"
        f"- Scope : {cps.scope}\n"
        f"- Acheteur : {cps.acheteur}\n"
        f"- Critères : {json.dumps(cps.criteres, ensure_ascii=False)}\n"
        f"- Délais : {cps.delais}"
    )

    # Role « fast » (LLM_FAST), relances 429 conservees (spec fournisseurs-ia).
    raw = appeler_sync(
        "fast", STRATEGY_SYSTEM, user_prompt,
        temperature=0.3, max_tokens=2000, json_mode=True,
        retry_delays=_RETRY_DELAYS,
    )

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
