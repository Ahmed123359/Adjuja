"""
Machine a etats du mode accompagne : les 7 etapes d'un AO, leur applicabilite,
et le point de bascule unique entre le mode express et le mode accompagne.

Regle de conception centrale (voir context/feature-spec/mode-accompagne/api.md) :
le mode n'est JAMAIS teste a l'interieur d'une tache metier. Les taches font leur
travail sans savoir dans quel regime elles tournent. La difference entre les deux
modes tient en deux endroits, tous les deux ici :

1. `advance_or_gate()` -- appele en fin de tache : enchaine (express) ou pose
   attente_validation et s'arrete (accompagne).
2. `applicable_steps()` -- fonction pure, decide quelles etapes existent pour cet
   AO. Elle est appelee par les DEUX modes (le chord en express, la creation des
   lignes d'etapes en accompagne). C'est le point ou les deux modes pourraient
   diverger silencieusement si la logique etait dupliquee : elle ne l'est pas.
"""
from datetime import datetime, timezone
from typing import Any
import logging
import uuid

logger = logging.getLogger(__name__)

# Ordre du parcours. step_key -> (ordre, tache Celery associee ou None).
# Seule l'etape 3 (decision) n'a pas de tache : c'est une decision humaine, qui
# n'attend aucun calcul de fond et s'ouvre directement en attente_validation.
STEP_DEFINITIONS: list[tuple[str, int, str | None]] = [
    ("documents",     1, "task_classify_uploads"),
    ("comprehension", 2, "task_analyze_ao_context"),
    ("decision",      3, None),
    # Preparation affiche l'equipe proposee : elle attend task_match_team, qui en
    # mode express reste detache du chord (lance en .delay() par build_pipeline).
    ("preparation",   4, "task_match_team"),
    ("redaction",     5, "task_generate_note_metho"),
    ("remplissage",   6, "task_fill_documents"),
    ("signature",     7, "task_sign_and_compile"),
]

STEP_KEYS: list[str] = [key for key, _, _ in STEP_DEFINITIONS]
STEP_ORDER: dict[str, int] = {key: order for key, order, _ in STEP_DEFINITIONS}
STEP_TASK: dict[str, str | None] = {key: task for key, _, task in STEP_DEFINITIONS}

# Etapes dont l'applicabilite depend d'analyse_json, donc inconnue au lancement.
CONDITIONAL_STEPS: set[str] = {"redaction", "remplissage"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def applicable_steps(analyse_json: dict[str, Any] | None) -> dict[str, bool]:
    """Quelles etapes existent pour cet AO, d'apres l'analyse du CPS/RC.

    Extrait tel quel de task_build_pipeline pour etre partage par les deux modes.
    NE PAS reimplementer cette logique ailleurs : si elle diverge, un AO n'aura
    pas les memes etapes selon le mode choisi.

    La note metho est declenchee des qu'il y a au moins un document a generer.
    L'IA varie les noms (note_metho, note_moyens_humains_techniques, cv_animateurs,
    etc.) mais ADJUJA genere toujours une offre technique complete dans ce cas.
    """
    docs_requis = (analyse_json or {}).get("documents_requis", []) or []
    needs_note_metho = any(d.get("source") == "generer" for d in docs_requis)
    needs_fill = any(d.get("source") == "remplir" for d in docs_requis)

    result = {key: True for key in STEP_KEYS}
    result["redaction"] = needs_note_metho
    result["remplissage"] = needs_fill
    return result


async def create_steps_for_ao(session: Any, ao_id: str) -> None:
    """Cree les 7 lignes d'etapes au lancement d'un AO en mode accompagne.

    `applicable` vaut None pour redaction/remplissage : leur applicabilite depend
    d'analyse_json, qui n'existe pas encore a ce stade (il est produit par
    l'etape 2). Elle est fixee par `resolve_applicability()` juste apres.
    Ne commit pas : c'est a l'appelant de le faire dans sa propre transaction.
    """
    from app.db.models import AoPipelineStep

    for key, order, _task in STEP_DEFINITIONS:
        session.add(AoPipelineStep(
            id=str(uuid.uuid4()),
            ao_id=ao_id,
            step_key=key,
            step_order=order,
            statut="a_faire",
            applicable=None if key in CONDITIONAL_STEPS else True,
        ))
    logger.info("[steps] 7 etapes creees ao_id=%s", ao_id)


async def resolve_applicability(ao_id: str) -> None:
    """Fixe `applicable` sur redaction/remplissage une fois analyse_json connu.

    Appelee apres l'etape 2. Une etape non applicable passe au statut terminal
    non_applicable : l'enchainement la saute et l'UI l'affiche comme telle, elle
    n'est jamais supprimee silencieusement du parcours.
    """
    from app.db.base import AsyncSessionLocal
    from app.db.models import AoPipelineStep, AppelOffre
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        ao_res = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
        ao = ao_res.scalar_one_or_none()
        if not ao:
            return

        flags = applicable_steps(ao.analyse_json)
        steps_res = await session.execute(
            select(AoPipelineStep).where(
                AoPipelineStep.ao_id == ao_id,
                AoPipelineStep.step_key.in_(sorted(CONDITIONAL_STEPS)),
            )
        )
        for step in steps_res.scalars().all():
            step.applicable = flags[step.step_key]
            if not step.applicable:
                step.statut = "non_applicable"
        await session.commit()
    logger.info("[steps] applicabilite resolue ao_id=%s", ao_id)


async def get_mode(ao_id: str) -> str:
    """Le regime de traitement de cet AO. "express" par defaut, y compris si l'AO
    est introuvable : jamais de bascule accidentelle en accompagne."""
    from app.db.base import AsyncSessionLocal
    from app.db.models import AppelOffre
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
        ao = result.scalar_one_or_none()
        return (ao.mode if ao else "express") or "express"


async def next_applicable_step(session: Any, ao_id: str, after_step_key: str) -> Any:
    """La prochaine etape a traiter apres celle-ci, en sautant les non applicables.
    Retourne None si celle-ci etait la derniere."""
    from app.db.models import AoPipelineStep
    from sqlalchemy import select

    current_order = STEP_ORDER.get(after_step_key, 0)
    result = await session.execute(
        select(AoPipelineStep)
        .where(
            AoPipelineStep.ao_id == ao_id,
            AoPipelineStep.step_order > current_order,
            AoPipelineStep.statut != "non_applicable",
        )
        .order_by(AoPipelineStep.step_order)
    )
    return result.scalars().first()


async def mark_step(ao_id: str, step_key: str, statut: str,
                    erreur_message: str | None = None) -> None:
    """Pose un statut sur une etape.

    Sans effet si l'AO n'est pas en mode accompagne (aucune ligne d'etape n'existe
    alors), ce qui rend l'appel sur depuis une tache metier : elle appelle sans
    savoir dans quel mode elle tourne.
    """
    from app.db.base import AsyncSessionLocal
    from app.db.models import AoPipelineStep
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AoPipelineStep).where(
                AoPipelineStep.ao_id == ao_id,
                AoPipelineStep.step_key == step_key,
            )
        )
        step = result.scalar_one_or_none()
        if not step:
            return
        step.statut = statut
        if statut == "en_cours":
            step.started_at = _now_iso()
        elif statut in ("attente_validation", "validee"):
            step.completed_at = _now_iso()
        step.erreur_message = erreur_message
        await session.commit()


def launch_step_task(step_key: str, ao_id: str) -> bool:
    """Declenche la tache Celery d'une etape.

    Retourne False si l'etape n'en a pas (Decision : rien a calculer, elle
    s'ouvre directement en attente_validation).
    """
    task_name = STEP_TASK.get(step_key)
    if not task_name:
        return False

    from app.tasks import ao_tasks

    getattr(ao_tasks, task_name).delay(ao_id)
    return True


async def open_step(ao_id: str, step_key: str) -> None:
    """Ouvre une etape : lance sa tache si elle en a une, sinon l'ouvre
    directement en attente_validation."""
    if STEP_TASK.get(step_key) is None:
        await mark_step(ao_id, step_key, "attente_validation")
        logger.info("[steps] etape %s ouverte sans tache ao_id=%s", step_key, ao_id)
        return
    await mark_step(ao_id, step_key, "en_cours")
    launch_step_task(step_key, ao_id)
    logger.info("[steps] tache de l'etape %s lancee ao_id=%s", step_key, ao_id)


async def invalidate_following_steps(session: Any, ao_id: str, from_step_key: str) -> int:
    """Repasse a a_faire toutes les etapes qui suivent celle-ci.

    Applique la regle de retour en arriere : revenir sur une etape deja validee
    invalide les suivantes. Sans cela on peut aboutir a une note methodologique
    amendee a l'etape 5 et un ZIP compile a l'etape 7 a partir de l'ancienne
    version, sans que rien ne le signale.

    Les etapes non_applicable gardent leur statut terminal. Ne commit pas.
    """
    from app.db.models import AoPipelineStep
    from sqlalchemy import select

    current_order = STEP_ORDER.get(from_step_key, 0)
    result = await session.execute(
        select(AoPipelineStep).where(
            AoPipelineStep.ao_id == ao_id,
            AoPipelineStep.step_order > current_order,
            AoPipelineStep.statut != "non_applicable",
        )
    )
    steps = result.scalars().all()
    for step in steps:
        step.statut = "a_faire"
        step.erreur_message = None
        step.started_at = None
        step.completed_at = None
        step.validated_at = None
        step.validated_by = None
    return len(steps)


def advance_or_gate(ao_id: str, step_key: str) -> None:
    """LE point de bascule entre les deux modes, appele en fin de tache metier.

    - express : ne fait rien, l'enchainement reste celui de la chain / du chord
      Celery existant, exactement comme avant ce chantier.
    - accompagne : pose l'etape en attente_validation et s'arrete. Rien ne
      s'enchaine tant que l'utilisateur n'a pas valide.

    Synchrone : appelee depuis le corps synchrone d'une tache Celery, qui gere
    lui-meme son event loop via _run_async.
    """
    from app.tasks.ao_tasks import _run_async

    async def _gate() -> None:
        if await get_mode(ao_id) != "accompagne":
            return
        if step_key == "comprehension":
            # L'applicabilite de redaction/remplissage depend d'analyse_json,
            # qui vient d'etre produit par cette etape.
            await resolve_applicability(ao_id)
        await mark_step(ao_id, step_key, "attente_validation")
        logger.info("[steps] porte de validation posee sur %s ao_id=%s", step_key, ao_id)

    _run_async(_gate())


# Nom complet de la tache Celery -> etape qu'elle porte. Utilise par le handler
# d'echec, qui ne recoit que le nom de la tache.
TASK_NAME_TO_STEP: dict[str, str] = {
    f"app.tasks.ao_tasks.{task}": key
    for key, _, task in STEP_DEFINITIONS if task
}


def fail_step_from_task(task_name: str, args: tuple, exc: BaseException) -> None:
    """Marque l'etape en erreur quand sa tache Celery echoue.

    Branche sur le signal task_failure (voir celery_app.py) plutot que dans le
    corps des taches : aucune tache metier n'a a connaitre la machine a etats.
    Sans effet en mode express, ou aucune ligne d'etape n'existe.

    Pose aussi erreur sur l'AO lui-meme, qui restait sinon en "en_traitement"
    indefiniment -- un manque anterieur a ce chantier, commun aux deux modes.
    """
    step_key = TASK_NAME_TO_STEP.get(task_name)
    if not step_key or not args:
        return
    ao_id = args[0]
    if not isinstance(ao_id, str):
        return

    from app.tasks.ao_tasks import _run_async

    async def _fail() -> None:
        from app.db.base import AsyncSessionLocal
        from app.db.models import AppelOffre
        from sqlalchemy import select

        message = f"{type(exc).__name__}: {exc}"[:2000]
        await mark_step(ao_id, step_key, "erreur", message)
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
            ao = result.scalar_one_or_none()
            if ao:
                ao.statut = "erreur"
                ao.erreur_message = message
                ao.updated_at = _now_iso()
                await session.commit()

    try:
        _run_async(_fail())
        logger.error("[steps] etape %s en erreur ao_id=%s: %s", step_key, ao_id, exc)
    except Exception:
        # Un echec du handler d'echec ne doit jamais masquer l'erreur d'origine.
        logger.exception("[steps] impossible de marquer l'etape %s en erreur", step_key)


# ---------------------------------------------------------------------------
# Operations appelees par les routes
# ---------------------------------------------------------------------------

class StepError(Exception):
    """Erreur metier d'une operation d'etape, traduite en HTTP par la route."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


async def list_steps(ao_id: str) -> list[Any]:
    """Le parcours d'un AO, ordonne.

    Liste vide pour un AO en mode express : ce n'est pas une erreur, le frontend
    affiche alors l'ecran de progression actuel.
    """
    from app.db.base import AsyncSessionLocal
    from app.db.models import AoPipelineStep
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AoPipelineStep)
            .where(AoPipelineStep.ao_id == ao_id)
            .order_by(AoPipelineStep.step_order)
        )
        return list(result.scalars().all())


async def apply_corrections(session: Any, ao_id: str, step_key: str,
                            corrections: dict[str, Any] | None) -> None:
    """Applique les corrections de l'utilisateur avant de passer a la suite.

    Etape 2 : les champs corriges sont fusionnes dans appels_offres.analyse_json,
    qui est une copie locale propre a l'AO de cette org (verifie dans le code le
    2026-09-12 : import_from_watcher recoit le JSON par le payload HTTP et l'ecrit
    dans sa propre colonne JSONB). Corriger ici n'affecte donc aucune autre org.
    """
    if not corrections:
        return

    from app.db.models import AppelOffre
    from sqlalchemy import select

    if step_key != "comprehension":
        # Les corrections des etapes 5 (texte de la note) et 6 (champs remplis)
        # portent sur des artefacts MinIO, pas sur la ligne AO : elles passent par
        # des routes documents dediees, pas par cette porte.
        logger.info("[steps] corrections ignorees pour l'etape %s ao_id=%s", step_key, ao_id)
        return

    result = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
    ao = result.scalar_one_or_none()
    if not ao:
        return
    merged = dict(ao.analyse_json or {})
    merged.update(corrections)
    ao.analyse_json = merged
    ao.updated_at = _now_iso()
    logger.info("[steps] analyse_json corrige ao_id=%s (%d cles)", ao_id, len(corrections))


async def validate_step(ao_id: str, step_key: str, user_id: str,
                        corrections: dict[str, Any] | None = None) -> str | None:
    """La porte. Valide une etape et ouvre la suivante applicable.

    Retourne la step_key ouverte derriere, ou None si le parcours est termine.
    Leve StepError si l'etape n'attend pas de validation.
    """
    from app.db.base import AsyncSessionLocal
    from app.db.models import AoPipelineStep, AppelOffre
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        ao_res = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
        ao = ao_res.scalar_one_or_none()
        if not ao or (ao.mode or "express") != "accompagne":
            raise StepError(404, "Cet appel d'offres n'est pas en mode accompagne.")

        step_res = await session.execute(
            select(AoPipelineStep).where(
                AoPipelineStep.ao_id == ao_id,
                AoPipelineStep.step_key == step_key,
            )
        )
        step = step_res.scalar_one_or_none()
        if not step:
            raise StepError(404, "Etape introuvable.")
        if step.statut != "attente_validation":
            raise StepError(409, f"Cette etape n'attend pas de validation (statut : {step.statut}).")

        await apply_corrections(session, ao_id, step_key, corrections)

        step.statut = "validee"
        step.validated_at = _now_iso()
        step.validated_by = user_id

        following = await next_applicable_step(session, ao_id, step_key)
        next_key = following.step_key if following else None
        if next_key is None:
            ao.statut = "termine"
            ao.pipeline_pct = 100
            ao.updated_at = _now_iso()

        await session.commit()

    if next_key:
        await open_step(ao_id, next_key)
    logger.info("[steps] %s validee ao_id=%s, suivante=%s", step_key, ao_id, next_key)
    return next_key


async def abandon_ao(ao_id: str, user_id: str) -> None:
    """Refus explicite a l'etape Decision : l'AO est clos sans passer a la suite.

    Statut distinct d'erreur : un abandon n'est pas un echec et ne doit pas etre
    presente comme tel.
    """
    from app.db.base import AsyncSessionLocal
    from app.db.models import AoPipelineStep, AppelOffre
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        ao_res = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
        ao = ao_res.scalar_one_or_none()
        if not ao or (ao.mode or "express") != "accompagne":
            raise StepError(404, "Cet appel d'offres n'est pas en mode accompagne.")

        step_res = await session.execute(
            select(AoPipelineStep).where(
                AoPipelineStep.ao_id == ao_id,
                AoPipelineStep.step_key == "decision",
            )
        )
        step = step_res.scalar_one_or_none()
        if not step or step.statut != "attente_validation":
            raise StepError(409, "La decision n'est pas en attente.")

        step.statut = "validee"
        step.validated_at = _now_iso()
        step.validated_by = user_id
        ao.statut = "abandonne"
        ao.updated_at = _now_iso()
        await invalidate_following_steps(session, ao_id, "decision")
        await session.commit()
    logger.info("[steps] AO abandonne a l'etape decision ao_id=%s", ao_id)


async def rerun_step(ao_id: str, step_key: str) -> int:
    """Relance une etape, sur incident (erreur) ou en retour en arriere (validee).

    Un retour en arriere invalide toutes les etapes suivantes : sans cela on peut
    aboutir a une note amendee a l'etape 5 et un ZIP compile a l'etape 7 depuis
    l'ancienne version, sans que rien ne le signale.

    Retourne le nombre d'etapes suivantes invalidees.
    """
    from app.db.base import AsyncSessionLocal
    from app.db.models import AoPipelineStep, AppelOffre
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        ao_res = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
        ao = ao_res.scalar_one_or_none()
        if not ao or (ao.mode or "express") != "accompagne":
            raise StepError(404, "Cet appel d'offres n'est pas en mode accompagne.")

        step_res = await session.execute(
            select(AoPipelineStep).where(
                AoPipelineStep.ao_id == ao_id,
                AoPipelineStep.step_key == step_key,
            )
        )
        step = step_res.scalar_one_or_none()
        if not step:
            raise StepError(404, "Etape introuvable.")
        if step.statut == "non_applicable":
            raise StepError(409, "Cette etape ne s'applique pas a cet appel d'offres.")
        if step.statut not in ("erreur", "validee", "attente_validation"):
            raise StepError(409, f"Cette etape ne peut pas etre relancee (statut : {step.statut}).")

        invalidated = await invalidate_following_steps(session, ao_id, step_key)
        step.erreur_message = None
        step.validated_at = None
        step.validated_by = None
        step.completed_at = None

        if ao.statut in ("termine", "erreur", "abandonne"):
            ao.statut = "en_traitement"
            ao.erreur_message = None
            ao.updated_at = _now_iso()

        await session.commit()

    await open_step(ao_id, step_key)
    logger.info("[steps] %s relancee ao_id=%s, %d etape(s) invalidee(s)",
                step_key, ao_id, invalidated)
    return invalidated
