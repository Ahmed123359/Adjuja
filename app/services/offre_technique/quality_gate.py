import json
import logging
import re
import time

import requests

from app.models.offre_technique import CPSContext, QualityReport, SectionScore, StrategyAngle
from app.services.offre_technique.prompts import QUALITY_REVIEW_SYSTEM

logger = logging.getLogger(__name__)

_MISTRAL_URL   = "https://api.mistral.ai/v1/chat/completions"
_MODEL         = "mistral-small-latest"
_SCORE_FLOOR   = 0.65
_RETRY_DELAYS  = (10, 30, 60)


def evaluate(
    sections: dict[str, str],
    cps: CPSContext,
    angle: StrategyAngle,
    api_key: str,
) -> QualityReport:
    sections_text = "\n\n".join(
        f"=== {name.upper()} ===\n{text}"
        for name, text in sections.items()
    )

    user_prompt = (
        f"Angle narratif attendu : {angle.angle}  {angle.narrative}\n\n"
        f"Exigences CPS :\n"
        f"- Scope : {cps.scope}\n"
        f"- Délais : {cps.delais}\n"
        f"- Critères : {json.dumps(cps.criteres, ensure_ascii=False)}\n\n"
        f"Offre technique soumise :\n{sections_text[:8000]}"
    )

    payload = {
        "model":           _MODEL,
        "messages":        [
            {"role": "system", "content": QUALITY_REVIEW_SYSTEM},
            {"role": "user",   "content": user_prompt},
        ],
        "temperature":     0,
        "response_format": {"type": "json_object"},
    }
    for attempt, delay in enumerate((*_RETRY_DELAYS, None), start=1):
        resp = requests.post(
            _MISTRAL_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
            timeout=45,
        )
        if resp.status_code != 429 or delay is None:
            break
        logger.warning("Quality gate 429  attente %ds (tentative %d)", delay, attempt)
        time.sleep(delay)
    resp.raise_for_status()
    raw = resp.json()["choices"][0]["message"]["content"]

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        data = json.loads(m.group(0)) if m else {}

    def _score(key: str) -> SectionScore:
        d = data.get(key, {})
        return SectionScore(
            score=float(d.get("score", 0.7)),
            issues=d.get("issues", []),
        )

    conformite      = _score("conformite")
    coherence       = _score("coherence")
    differentiation = _score("differentiation")

    global_score = round(
        conformite.score * 0.4 + coherence.score * 0.35 + differentiation.score * 0.25, 2
    )
    approved = all(
        s.score >= _SCORE_FLOOR
        for s in [conformite, coherence, differentiation]
    )

    return QualityReport(
        conformite=conformite,
        coherence=coherence,
        differentiation=differentiation,
        global_score=global_score,
        approved=approved,
    )


def find_weakest_section(sections: dict[str, str], report: QualityReport) -> str | None:
    """Retourne le nom de la section à régénérer, ou None si tout est approuvé."""
    if report.approved:
        return None
    issues_text = " ".join(
        report.conformite.issues + report.coherence.issues + report.differentiation.issues
    ).lower()
    priority = ["methodologie", "moyens", "planning", "rse", "references"]
    for section in priority:
        if section in issues_text:
            return section
    return priority[0]
