"""
Assistance IA contextualisee par etape du mode accompagne.

Ne construit PAS un second systeme de conversation : reutilise ChatService, donc
RagService et le meme corpus reglementaire. Ce module n'ajoute qu'une chose, le
cadrage : ce que l'assistant sait de l'AO courant et ce qu'il est cense faire a
l'etape ou se trouve l'utilisateur.

C'est aussi l'assistant prevu par context/feature-spec/preview-documents-ocr/ :
construit une seule fois ici, ce chantier passant en premier.
"""
from typing import Any
import json
import logging

logger = logging.getLogger(__name__)

# Ce que l'assistant est cense faire, etape par etape. Volontairement etroit :
# un assistant qui peut tout faire a chaque etape ne guide plus personne.
STEP_ROLES: dict[str, str] = {
    "documents": (
        "Aide l'utilisateur a verifier que chaque fichier du dossier est classe "
        "dans le bon type (CPS, RC, acte d'engagement, bordereau). Explique a quoi "
        "sert chaque type de document dans un marche public marocain."
    ),
    "comprehension": (
        "Explique les exigences de cet appel d'offres en langage clair : ce qui est "
        "demande, les qualifications exigees, les seuils, les delais. Si une exigence "
        "est ambigue, dis-le plutot que de l'interpreter a la place de l'utilisateur."
    ),
    "decision": (
        "Aide l'utilisateur a decider s'il soumissionne. Justifie chaque point du "
        "verdict d'eligibilite a partir des exigences reelles de l'AO et du profil "
        "de l'entreprise. N'encourage ni ne decourage : expose les faits."
    ),
    "preparation": (
        "Aide l'utilisateur a preparer son dossier : quelles pieces produire, ce qui "
        "manque a son profil, quels profils d'equipe sont attendus."
    ),
    "redaction": (
        "Aide l'utilisateur a relire et ameliorer sa note methodologique. Propose des "
        "reformulations concretes plutot que des conseils generaux. Ne reecris pas "
        "la note entiere sans qu'on te le demande."
    ),
    "remplissage": (
        "Aide l'utilisateur a verifier les documents administratifs remplis, champ "
        "par champ. Signale une valeur qui semble incoherente avec le profil ou l'AO."
    ),
    "signature": (
        "Aide l'utilisateur a verifier que son dossier final est complet avant depot : "
        "pieces presentes, signatures, format attendu."
    ),
}

# Bornes de contexte : un analyse_json complet peut etre volumineux, et l'envoyer
# en entier a chaque tour couterait des tokens pour rien.
_MAX_CONTEXT_CHARS = 8000


def build_step_context(ao: Any, step_key: str, verdict: dict[str, Any] | None = None) -> str:
    """Le cadrage injecte en tete de conversation pour cette etape et cet AO.

    Retourne un bloc texte, pas un message system : ChatService assemble lui-meme
    ses messages, on ne double pas sa logique de prompt.
    """
    role = STEP_ROLES.get(step_key, "Aide l'utilisateur sur cette etape de son dossier.")

    analyse = ao.analyse_json or {}
    analyse_txt = json.dumps(analyse, ensure_ascii=False, indent=2)[:_MAX_CONTEXT_CHARS]

    parts = [
        "Tu assistes un utilisateur d'ADJUJA sur un appel d'offres public marocain "
        "precis, a une etape precise de son traitement.",
        f"Etape courante : {step_key}. {role}",
        f"Objet de l'AO : {ao.objet or 'non renseigne'}",
        f"Acheteur : {ao.acheteur or 'non renseigne'}",
        f"Reference : {ao.reference or 'non renseignee'}",
        f"Analyse du dossier (extraite du CPS et du RC) :\n{analyse_txt}",
    ]
    if verdict:
        parts.append(
            "Verdict d'eligibilite calcule :\n"
            + json.dumps(verdict, ensure_ascii=False, indent=2)[:2000]
        )
    parts.append(
        "Reponds uniquement sur cet appel d'offres et cette etape. Si la question "
        "sort de ce cadre, dis-le et ramene l'utilisateur a l'etape courante. "
        "Si l'information n'est pas dans le dossier, dis que tu ne l'as pas plutot "
        "que de l'inventer."
    )
    return "\n\n".join(parts)


async def load_ao_for_assist(ao_id: str, org_id: str) -> Any:
    """Charge l'AO avec la garde d'appartenance a l'org. None si absent."""
    from app.db.base import AsyncSessionLocal
    from app.db.models import AppelOffre
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppelOffre).where(AppelOffre.id == ao_id, AppelOffre.org_id == org_id)
        )
        return result.scalar_one_or_none()
