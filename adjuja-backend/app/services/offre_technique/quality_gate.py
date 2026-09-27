import json
import logging
import re


from app.models.offre_technique import CPSContext, QualityReport, SectionScore, StrategyAngle
from app.services.offre_technique.prompts import QUALITY_REVIEW_SYSTEM
from app.services.offre_technique.llm import appeler_sync

logger = logging.getLogger(__name__)

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

    # Role « fast » (LLM_FAST), relances 429 conservees (spec fournisseurs-ia).
    raw = appeler_sync(
        "fast", QUALITY_REVIEW_SYSTEM, user_prompt,
        temperature=0, max_tokens=3000, json_mode=True,
        retry_delays=_RETRY_DELAYS,
    )

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
