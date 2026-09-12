"""
Tâches Celery pour le pipeline AO automatisé.

Phase 4a : task_dummy_pipeline (validation socle)
Phase 4b : task_classify_uploads (classification des uploads)
Phase 4c : task_analyze_ao_context + task_build_pipeline
Phase 4d : task_generate_note_metho + task_fill_documents
Phase 4e : task_sign_and_compile (signing + ZIP final)
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone

from celery import shared_task

from app.services.pipeline_steps_service import (
    advance_or_gate,
    applicable_steps,
    mark_step,
)

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Exécute une coroutine dans un event loop dédié (contexte worker Celery synchrone).

    On dispose le pool asyncpg avant de fermer le loop pour éviter l'erreur
    'Future attached to a different loop' entre deux tâches successives dans
    le même process worker (le pool réutilise sinon des connexions liées à
    l'ancien loop).
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        try:
            from app.db.base import engine
            loop.run_until_complete(engine.dispose())
        except Exception:
            pass
        loop.close()
        asyncio.set_event_loop(None)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _set_pct(ao_id: str, pct: int, statut: str | None = None) -> None:
    """Met à jour pipeline_pct (et optionnellement statut) en DB."""
    from app.db.base import AsyncSessionLocal
    from app.db.models import AppelOffre
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
        ao = result.scalar_one_or_none()
        if ao:
            ao.pipeline_pct = pct
            if statut:
                ao.statut = statut
            ao.updated_at = _now_iso()
            await session.commit()


# ---------------------------------------------------------------------------
# Phase 4a  Tâche dummy (validation socle)
# ---------------------------------------------------------------------------

@shared_task(bind=True, name="app.tasks.ao_tasks.task_dummy_pipeline", max_retries=3)
def task_dummy_pipeline(self, ao_id: str) -> dict:
    """Tâche de test Phase 4a : simule un pipeline et met à jour pipeline_pct 0→100."""
    logger.info("[dummy] début pipeline ao_id=%s", ao_id)

    async def _update(pct: int) -> None:
        from app.db.base import AsyncSessionLocal
        from app.db.models import AppelOffre
        from sqlalchemy import select

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AppelOffre).where(AppelOffre.id == ao_id)
            )
            ao = result.scalar_one_or_none()
            if ao:
                ao.pipeline_pct = pct
                if pct == 100:
                    ao.statut = "termine"
                ao.updated_at = _now_iso()
                await session.commit()

    for pct in (25, 50, 75, 100):
        _run_async(_update(pct))
        logger.info("[dummy] ao_id=%s → %d%%", ao_id, pct)

    logger.info("[dummy] pipeline terminé ao_id=%s", ao_id)
    return {"ao_id": ao_id, "statut": "termine"}


# ---------------------------------------------------------------------------
# Phase 4b  Classification des uploads
# ---------------------------------------------------------------------------

def _classify_by_filename(filename: str) -> tuple[str, str] | None:
    """Heuristique prioritaire basée sur le nom de fichier. Retourne (doc_type, dossier) ou None."""
    import re
    name = filename.lower()
    # Supprimer préfixes numériques ex: "5-CPS..." ou "6-RC..."
    name = re.sub(r"^\d+[-_\s]*", "", name)

    if re.search(r"\bcps\b|cahier.pres|prescriptions.spec", name):
        return ("cps", "source")
    if re.search(r"\brc\b|reglement.consul|règlement.consul", name):
        return ("rc", "source")
    if re.search(r"acte.eng|acte_eng", name):
        return ("acte_engagement", "financier")
    if re.search(r"declaration.honneur|déclaration.honneur|dsh\b", name):
        return ("declaration_honneur", "administratif")
    if re.search(r"bordereau|detail.estimatif", name):
        return ("bordereau", "financier")
    if re.search(r"attestation.fisc|attestation_fisc|if_fiscal", name):
        return ("attestation_fiscale", "administratif")
    if re.search(r"attestation.cnss|cnss", name):
        return ("attestation_cnss", "administratif")
    return None


@shared_task(bind=True, name="app.tasks.ao_tasks.task_classify_uploads", max_retries=2)
def task_classify_uploads(self, ao_id: str) -> dict:
    """Classifie chaque document source (doc_type='non_classe').

    Priorité : heuristique nom de fichier > detect_document_type() sur le contenu.
    Un CPS qui contient aussi un bordereau reste classifié CPS (le nom prime).
    """
    logger.info("[classify] début ao_id=%s", ao_id)
    _run_async(_set_pct(ao_id, 5))

    _DOC_TYPE_MAP = {
        "cahier_charges":      ("cps",                 "source"),
        "rc":                  ("rc",                  "source"),
        "acte_engagement":     ("acte_engagement",     "financier"),
        "declaration_honneur": ("declaration_honneur", "administratif"),
        "bordereau_prix":      ("bordereau",           "financier"),
        "attestation_fiscale": ("attestation_fiscale", "administratif"),
    }

    async def _classify() -> dict:
        import fitz
        from app.db.base import AsyncSessionLocal
        from app.db.models import AoDocument
        from app.services.filler.filler_processors import detect_document_type
        from app.storage import minio_client as mc
        from sqlalchemy import select

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AoDocument).where(
                    AoDocument.ao_id == ao_id,
                    AoDocument.doc_type == "non_classe",
                    AoDocument.minio_key.isnot(None),
                )
            )
            docs = result.scalars().all()

            classified = 0
            for doc in docs:
                try:
                    # 1. Heuristique nom de fichier (prioritaire)
                    filename_result = _classify_by_filename(doc.nom_fichier or "")
                    if filename_result:
                        doc_type, dossier = filename_result
                        logger.info("[classify] doc=%s → %s (filename heuristic)", doc.id, doc_type)
                    else:
                        # 2. Fallback : analyse du contenu
                        pdf_bytes = mc.get_file_bytes(doc.minio_key)
                        with fitz.open(stream=pdf_bytes, filetype="pdf") as pdf:
                            text = "".join(page.get_text() for page in pdf)
                        raw_type = detect_document_type(text)
                        doc_type, dossier = _DOC_TYPE_MAP.get(raw_type, ("autre", "source"))
                        logger.info("[classify] doc=%s → %s (content detection)", doc.id, doc_type)

                    doc.doc_type = doc_type
                    doc.dossier  = dossier
                    doc.statut   = "traite"
                    classified  += 1
                except Exception as exc:
                    logger.error("[classify] erreur doc=%s: %s", doc.id, exc)
                    doc.statut = "erreur"

            await session.commit()

        return {"ao_id": ao_id, "classified": classified}

    result = _run_async(_classify())
    advance_or_gate(ao_id, "documents")
    return result


# ---------------------------------------------------------------------------
# Phase 4c  Analyse CPS + RC → analyse_json
# ---------------------------------------------------------------------------

def _build_analyze_prompt(cps_text: str, rc_text: str) -> str:
    rc_section = f"\n\n=== RÈGLEMENT DE CONSULTATION (RC) ===\n{rc_text}" if rc_text else "\n(RC non disponible)"
    return f"""Tu es un expert en marchés publics marocains. Analyse ce dossier d'appel d'offres et retourne un JSON structuré.

=== CAHIER DES PRESCRIPTIONS SPÉCIALES (CPS) ===
{cps_text}{rc_section}

Retourne UNIQUEMENT un JSON valide (sans markdown) avec cette structure :
{{
  "contexte": {{
    "intitule": "...",
    "acheteur": "...",
    "objet": "...",
    "date_limite": "...",
    "budget_estime": null,
    "lots": []
  }},
  "documents_requis": [
    {{"nom": "note_metho", "obligatoire": true, "source": "generer"}},
    {{"nom": "acte_engagement", "obligatoire": true, "source": "remplir"}},
    {{"nom": "bordereau", "obligatoire": true, "source": "remplir"}},
    {{"nom": "declaration_honneur", "obligatoire": true, "source": "remplir"}}
  ],
  "criteres_ponderation": [
    {{"nom": "offre technique", "poids": 60}},
    {{"nom": "offre financiere", "poids": 40}}
  ],
  "strategie_offre_technique": {{
    "insister_sur": ["methodologie", "equipe", "experience"],
    "sections_cles": ["contexte", "methodologie", "planning", "equipe"]
  }},
  "profils_requis": [
    {{
      "poste": "Chef de projet",
      "specialite": "génie civil",
      "diplome_min": "Ingénieur d'état",
      "annees_experience_min": 10,
      "description": "texte exact du CPS"
    }}
  ]
}}

RÈGLES :
- documents_requis : liste les docs EXIGÉS par le RC (note_metho, acte_engagement, bordereau, declaration_honneur, cps_signe, rc_signe, attestation_cnss, attestation_fiscale, etc.)
- source : "generer" = LLM le crée, "remplir" = filler remplit le template uploadé, "signer" = signer uniquement
- criteres_ponderation : utilise les poids EXACTS du RC si présents
- strategie_offre_technique : insister sur les critères avec les poids les plus élevés
- profils_requis : TOUS les profils humains exigés dans le CPS/RC (chef de projet, conducteur de travaux, ingénieurs spécialisés...). Si aucun profil n'est exigé, retourner []
- Si RC absent : déduis depuis le CPS, marque date_limite="non_disponible"
"""


@shared_task(bind=True, name="app.tasks.ao_tasks.task_analyze_ao_context", max_retries=2)
def task_analyze_ao_context(self, ao_id: str) -> dict:
    """Lit CPS + RC → produit analyse_json via Mistral.

    N'enchaîne rien elle-même : c'est le chain de la route start-pipeline qui
    appelle task_build_pipeline derrière (mode express), ou la porte de validation
    de l'étape 2 (mode accompagné).
    """
    logger.info("[analyze] début ao_id=%s", ao_id)
    _run_async(_set_pct(ao_id, 10))

    async def _analyze() -> dict:
        import json, re
        import fitz
        from app.db.base import AsyncSessionLocal
        from app.db.models import AoDocument, AppelOffre
        from app.storage import minio_client as mc
        from app.config.settings import get_settings
        from mistralai import Mistral
        from sqlalchemy import select

        # Deja analyse cote ao-watcher (veille) avant l'import -> pas de
        # second appel Mistral pour le meme CPS/RC, cf. import_from_watcher.
        async with AsyncSessionLocal() as session:
            existing = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
            existing_ao = existing.scalar_one_or_none()
            if existing_ao and existing_ao.analyse_json:
                existing_ao.statut       = "en_traitement"
                existing_ao.pipeline_pct = 20
                existing_ao.updated_at   = _now_iso()
                await session.commit()
                logger.info("[analyze] analyse_json deja present (reuse ao-watcher) ao_id=%s", ao_id)
                return {"ao_id": ao_id, "analyse_json": existing_ao.analyse_json}

        async with AsyncSessionLocal() as session:
            docs_result = await session.execute(
                select(AoDocument).where(
                    AoDocument.ao_id == ao_id,
                    AoDocument.doc_type.in_(["cps", "rc"]),
                    AoDocument.minio_key.isnot(None),
                )
            )
            docs = docs_result.scalars().all()

        cps_text = ""
        rc_text  = ""
        for doc in docs:
            pdf_bytes = mc.get_file_bytes(doc.minio_key)
            with fitz.open(stream=pdf_bytes, filetype="pdf") as pdf:
                text = "".join(page.get_text() for page in pdf)
            if doc.doc_type == "cps":
                cps_text = text[:60000]
            elif doc.doc_type == "rc":
                rc_text  = text[:40000]

        settings = get_settings()
        client   = Mistral(api_key=settings.mistral_api_key)
        response = client.chat.complete(
            model="mistral-large-latest",
            messages=[{"role": "user", "content": _build_analyze_prompt(cps_text, rc_text)}],
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or "{}"
        try:
            analyse_json = json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            analyse_json = json.loads(match.group()) if match else {}

        async with AsyncSessionLocal() as session:
            result = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
            ao = result.scalar_one_or_none()
            if ao:
                ao.analyse_json  = analyse_json
                ao.statut        = "en_traitement"
                ao.pipeline_pct  = 20
                ao.updated_at    = _now_iso()
                await session.commit()

        logger.info("[analyze] analyse_json stocké ao_id=%s", ao_id)
        return {"ao_id": ao_id, "analyse_json": analyse_json}

    result = _run_async(_analyze())
    advance_or_gate(ao_id, "comprehension")
    return result


@shared_task(bind=True, name="app.tasks.ao_tasks.task_build_pipeline", max_retries=1)
def task_build_pipeline(self, ao_id: str) -> None:
    """
    Construit dynamiquement le groupe de tâches selon analyse_json.
    Lance chord: group(note_metho + fill_docs) | sign_and_compile.
    """
    logger.info("[build_pipeline] ao_id=%s", ao_id)

    async def _get_ao():
        from app.db.base import AsyncSessionLocal
        from app.db.models import AppelOffre
        from sqlalchemy import select
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
            return result.scalar_one_or_none()

    ao = _run_async(_get_ao())
    analyse_json = ao.analyse_json or {} if ao else {}

    # Décision d'applicabilité partagée avec le mode accompagné : une seule
    # implémentation (pipeline_steps_service.applicable_steps), sinon les deux
    # modes divergeraient silencieusement le jour où l'un des deux est modifié.
    flags = applicable_steps(analyse_json)
    needs_note_metho = flags["redaction"]
    needs_fill       = flags["remplissage"]

    from celery import group, chord, chain

    tasks = []
    if needs_note_metho:
        tasks.append(task_generate_note_metho.si(ao_id))
    if needs_fill:
        tasks.append(task_fill_documents.si(ao_id))

    # Matching équipe, lancé si des profils sont requis dans analyse_json.
    profils_requis = analyse_json.get("profils_requis", [])

    if not tasks:
        # Rien à générer ni à remplir : le matching n'alimente alors aucune tâche
        # en aval, il peut rester détaché.
        if profils_requis:
            task_match_team.delay(ao_id)
        task_sign_and_compile.delay(ao_id)
        return

    pipeline = chord(group(*tasks), task_sign_and_compile.si(ao_id))

    if profils_requis and needs_note_metho:
        # COURSE CORRIGÉE (2026-09-12) : task_generate_note_metho lit AoTeamMember,
        # que produit task_match_team. Ce dernier était lancé en .delay() détaché
        # au même instant que le chord, donc rien ne garantissait qu'il ait fini :
        # la note pouvait partir SANS équipe, en silence. Il précède maintenant le
        # chord quand la note est au programme.
        #
        # Conséquence assumée : si le matching échoue, le pipeline s'arrête en
        # erreur au lieu de produire une note incomplète. Un échec visible vaut
        # mieux qu'un document silencieusement amputé.
        chain(task_match_team.si(ao_id), pipeline).delay()
        logger.info(
            "[build_pipeline] match_team → chord lancé: %d tâches → sign_and_compile → index_results",
            len(tasks),
        )
        return

    if profils_requis:
        # Pas de note métho à générer : personne ne lit AoTeamMember en aval,
        # le matching peut rester détaché comme avant.
        task_match_team.delay(ao_id)

    pipeline.delay()
    logger.info("[build_pipeline] chord lancé: %d tâches → sign_and_compile → index_results", len(tasks))


# ---------------------------------------------------------------------------
# Phase 4d  Génération note métho + remplissage documents
# ---------------------------------------------------------------------------

@shared_task(bind=True, name="app.tasks.ao_tasks.task_match_team", max_retries=1, queue="celery_io")
def task_match_team(self, ao_id: str) -> dict:
    """
    Lit profils_requis depuis analyse_json, charge le pool de CVs de l'org,
    demande à Mistral de faire le matching, crée les AoTeamMember.
    Warning=True pour tout profil non couvert.
    """
    logger.info("[match_team] début ao_id=%s", ao_id)

    async def _match() -> dict:
        import json
        from app.db.base import AsyncSessionLocal
        from app.db.models import AppelOffre, StaffCv, AoTeamMember
        from app.config.settings import get_settings
        from mistralai import Mistral
        from sqlalchemy import select, delete as sa_delete

        async with AsyncSessionLocal() as session:
            ao_res = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
            ao = ao_res.scalar_one_or_none()
            if not ao:
                return {"ao_id": ao_id, "skipped": True, "reason": "AO introuvable"}

            profils_requis = (ao.analyse_json or {}).get("profils_requis", [])
            if not profils_requis:
                return {"ao_id": ao_id, "skipped": True, "reason": "Aucun profil requis"}

            cvs_res = await session.execute(
                select(StaffCv).where(
                    StaffCv.org_id == ao.org_id,
                    StaffCv.actif.is_(True),
                )
            )
            pool = cvs_res.scalars().all()

            # Supprimer les anciens matchings pour cet AO
            await session.execute(sa_delete(AoTeamMember).where(AoTeamMember.ao_id == ao_id))
            await session.commit()

        if not pool:
            # Aucun CV dans le pool : tous les profils en warning
            async with AsyncSessionLocal() as session:
                for p in profils_requis:
                    session.add(AoTeamMember(
                        id=str(uuid.uuid4()),
                        ao_id=ao_id,
                        staff_cv_id=None,
                        created_at=_now_iso(),
                        role_dans_offre=p.get("poste", ""),
                        profil_requis_ref=p.get("description", ""),
                        warning=True,
                    ))
                await session.commit()
            return {"ao_id": ao_id, "matched": 0, "warnings": len(profils_requis)}

        # Construire le prompt de matching
        pool_txt = "\n".join(
            f"- ID:{cv.id} | {cv.nom} {cv.prenom} | Poste:{cv.poste} | "
            f"Spécialité:{cv.specialite} | Diplôme:{cv.diplome} | "
            f"Expérience:{cv.annees_experience} ans"
            for cv in pool
        )
        profils_txt = json.dumps(profils_requis, ensure_ascii=False, indent=2)

        prompt = f"""Tu es expert en marchés publics. Associe chaque profil requis au meilleur CV disponible.

PROFILS REQUIS DU CPS :
{profils_txt}

POOL DE CVs DISPONIBLES :
{pool_txt}

Retourne UNIQUEMENT un JSON valide (sans markdown) :
{{
  "matchings": [
    {{
      "poste": "...",
      "profil_requis_ref": "description exacte du CPS",
      "staff_cv_id": "ID du CV choisi ou null si aucun ne correspond",
      "warning": false
    }}
  ]
}}

RÈGLES :
- Un CV peut être assigné à plusieurs postes si nécessaire.
- warning=true si AUCUN CV du pool ne satisfait le profil (expérience insuffisante, spécialité absente, etc.).
- Ne crée pas de matching fictif : si la correspondance est mauvaise, mets warning=true et staff_cv_id=null.
"""
        settings = get_settings()
        client = Mistral(api_key=settings.mistral_api_key)
        response = client.chat.complete(
            model="mistral-large-latest",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or "{}"
        try:
            data = json.loads(raw)
        except Exception:
            import re
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            data = json.loads(m.group()) if m else {"matchings": []}

        matchings = data.get("matchings", [])
        matched = 0
        warnings = 0

        async with AsyncSessionLocal() as session:
            for m in matchings:
                cv_id = m.get("staff_cv_id")
                is_warning = m.get("warning", False) or not cv_id
                session.add(AoTeamMember(
                    id=str(uuid.uuid4()),
                    ao_id=ao_id,
                    staff_cv_id=cv_id,
                    created_at=_now_iso(),
                    role_dans_offre=m.get("poste", ""),
                    profil_requis_ref=m.get("profil_requis_ref", ""),
                    warning=is_warning,
                ))
                if is_warning:
                    warnings += 1
                else:
                    matched += 1
            await session.commit()

        logger.info("[match_team] ao_id=%s matched=%d warnings=%d", ao_id, matched, warnings)
        return {"ao_id": ao_id, "matched": matched, "warnings": warnings}

    result = _run_async(_match())
    # Étape 4 (Préparation) affiche l'équipe proposée : en mode accompagné elle
    # attend donc la fin de ce matching. En express, advance_or_gate ne fait rien
    # et la tâche reste détachée comme avant ce chantier.
    advance_or_gate(ao_id, "preparation")
    return result


@shared_task(bind=True, name="app.tasks.ao_tasks.task_generate_note_metho", max_retries=2)
def task_generate_note_metho(self, ao_id: str) -> dict:
    """Génère la note méthodologique via offre_technique_service (RAG obligatoire)."""
    logger.info("[note_metho] début ao_id=%s", ao_id)
    _run_async(_set_pct(ao_id, 30))

    async def _generate() -> dict:
        from app.db.base import AsyncSessionLocal
        from app.db.models import AoDocument, AppelOffre, CompanyProfile, AoTeamMember, StaffCv
        from app.services.offre_technique_service import run_offre_technique
        from app.storage import minio_client as mc
        from app.config.settings import get_settings
        from sqlalchemy import select, delete as sa_delete

        async with AsyncSessionLocal() as session:
            ao_res = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
            ao = ao_res.scalar_one_or_none()
            if not ao:
                raise ValueError(f"AO {ao_id} introuvable")

            # Supprimer l'ancienne note métho pour éviter les doublons sur relance
            await session.execute(
                sa_delete(AoDocument).where(
                    AoDocument.ao_id == ao_id,
                    AoDocument.doc_type == "note_metho",
                    AoDocument.origine == "genere",
                )
            )
            await session.commit()

            docs_res = await session.execute(
                select(AoDocument).where(
                    AoDocument.ao_id == ao_id,
                    AoDocument.doc_type.in_(["cps", "rc"]),
                    AoDocument.minio_key.isnot(None),
                )
            )
            docs = docs_res.scalars().all()

            profile_res = await session.execute(
                select(CompanyProfile).where(CompanyProfile.org_id == ao.org_id)
            )
            profile = profile_res.scalar_one_or_none()
            org_id = ao.org_id

            # Charger l'équipe matchée pour cet AO (format dict pour le service)
            team_res = await session.execute(
                select(AoTeamMember).where(AoTeamMember.ao_id == ao_id)
            )
            team_orm = team_res.scalars().all()
            team_dicts: list[dict] = []
            for tm in team_orm:
                cv_dict = None
                if tm.staff_cv_id:
                    cv_res = await session.execute(
                        select(StaffCv).where(StaffCv.id == tm.staff_cv_id)
                    )
                    cv = cv_res.scalar_one_or_none()
                    if cv:
                        cv_dict = {
                            "nom": cv.nom, "prenom": cv.prenom,
                            "poste": cv.poste, "specialite": cv.specialite,
                            "diplome": cv.diplome, "annees_experience": cv.annees_experience,
                            "cv_url": None,
                        }
                team_dicts.append({
                    "role_dans_offre": tm.role_dans_offre,
                    "profil_requis_ref": tm.profil_requis_ref,
                    "warning": tm.warning,
                    "cv": cv_dict,
                })

            # Instructions injectées dans les prompts : org global + AO spécifique
            parts = [p for p in [
                profile.custom_instructions if profile else None,
                ao.custom_instructions,
            ] if p]
            custom_instructions = "\n\n".join(parts) or None

        cps_bytes = None
        rc_bytes  = None
        for doc in docs:
            raw = mc.get_file_bytes(doc.minio_key)
            if doc.doc_type == "cps":
                cps_bytes = raw
            elif doc.doc_type == "rc":
                rc_bytes  = raw

        if not cps_bytes:
            logger.warning("[note_metho] CPS manquant ao_id=%s, skip", ao_id)
            return {"ao_id": ao_id, "skipped": True}

        # Charger le template DOCX de l'org si disponible
        template_bytes: bytes | None = None
        if profile and profile.template_note_metho_minio_key:
            try:
                template_bytes = mc.get_file_bytes(profile.template_note_metho_minio_key)
                logger.info("[note_metho] Template org chargé : %s", profile.template_note_metho_minio_key)
            except Exception as exc:
                logger.warning("[note_metho] Template non chargeable, fallback défaut : %s", exc)

        # Attendre que task_match_team peuple ao_team_members (max 90s, polling 15s)
        if not team_dicts:
            for attempt in range(6):
                await asyncio.sleep(15)
                async with AsyncSessionLocal() as s2:
                    tr = await s2.execute(select(AoTeamMember).where(AoTeamMember.ao_id == ao_id))
                    fresh_orm = tr.scalars().all()
                    if fresh_orm:
                        for tm in fresh_orm:
                            cv_dict = None
                            if tm.staff_cv_id:
                                cr = await s2.execute(select(StaffCv).where(StaffCv.id == tm.staff_cv_id))
                                cv = cr.scalar_one_or_none()
                                if cv:
                                    cv_dict = {"nom": cv.nom, "prenom": cv.prenom, "poste": cv.poste,
                                               "specialite": cv.specialite, "diplome": cv.diplome,
                                               "annees_experience": cv.annees_experience, "cv_url": None}
                            team_dicts.append({"role_dans_offre": tm.role_dans_offre,
                                               "profil_requis_ref": tm.profil_requis_ref,
                                               "warning": tm.warning, "cv": cv_dict})
                        logger.info("[note_metho] team_members chargés après %ds : %d membres", (attempt+1)*15, len(team_dicts))
                        break
            else:
                logger.warning("[note_metho] task_match_team non terminée après 90s, équipe vide")

        settings = get_settings()
        result   = await run_offre_technique(
            pdf_bytes=cps_bytes,
            filename="cps.pdf",
            api_key=settings.mistral_api_key,
            org_id=org_id,
            rc_bytes=rc_bytes,
            custom_instructions=custom_instructions,
            team_members=team_dicts if team_dicts else None,
            template_bytes=template_bytes,
        )

        created_docs: list[str] = []
        async with AsyncSessionLocal() as session:
            for f in result.fichiers:
                if not f.minio_key:
                    continue
                # Copie directe via minio_key (pas de parsing d'URL)
                file_bytes = mc.get_file_bytes(f.minio_key)
                if not file_bytes:
                    continue
                dest_key = f"{org_id}/ao/{ao_id}/technique/{f.filename}"
                mc.upload_bytes(dest_key, file_bytes,
                    "application/pdf" if f.filename.endswith(".pdf") else
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                doc = AoDocument(
                    id=str(uuid.uuid4()),
                    ao_id=ao_id,
                    created_at=_now_iso(),
                    dossier="technique",
                    doc_type="note_metho",
                    origine="genere",
                    statut="traite",
                    minio_key=dest_key,
                    nom_fichier=f.filename,
                    taille_octets=len(file_bytes),
                )
                session.add(doc)
                created_docs.append(doc.id)

            ao_res = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
            ao_obj = ao_res.scalar_one_or_none()
            if ao_obj:
                ao_obj.pipeline_pct = 50
                ao_obj.updated_at   = _now_iso()
            await session.commit()

        logger.info("[note_metho] %d fichier(s) générés ao_id=%s", len(created_docs), ao_id)
        return {"ao_id": ao_id, "docs": created_docs}

    result = _run_async(_generate())
    advance_or_gate(ao_id, "redaction")
    return result


@shared_task(bind=True, name="app.tasks.ao_tasks.task_fill_documents", max_retries=2)
def task_fill_documents(self, ao_id: str) -> dict:
    """Passe TOUS les uploads au filler  il détecte lui-même ce qui est remplissable."""
    logger.info("[fill_docs] début ao_id=%s", ao_id)
    _run_async(_set_pct(ao_id, 55))

    async def _fill() -> dict:
        from app.db.base import AsyncSessionLocal
        from app.db.models import AoDocument, AppelOffre, CompanyProfile
        from app.services.filler_service import run_filler
        from app.services.filler.company_adapter import get_company_info
        from app.storage import minio_client as mc
        from app.config.settings import get_settings
        from sqlalchemy import select, delete as sa_delete

        async with AsyncSessionLocal() as session:
            ao_res = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
            ao = ao_res.scalar_one_or_none()
            if not ao:
                raise ValueError(f"AO {ao_id} introuvable")
            org_id = ao.org_id

            profile_res = await session.execute(
                select(CompanyProfile).where(CompanyProfile.org_id == org_id)
            )
            profile = profile_res.scalar_one_or_none()

            # TOUS les fichiers uploadés  le filler segmente et détecte lui-même
            docs_res = await session.execute(
                select(AoDocument).where(
                    AoDocument.ao_id == ao_id,
                    AoDocument.origine == "upload",
                    AoDocument.minio_key.isnot(None),
                )
            )
            docs = docs_res.scalars().all()

            # Supprimer les anciens docs remplis pour éviter les doublons sur relance
            await session.execute(
                sa_delete(AoDocument).where(
                    AoDocument.ao_id == ao_id,
                    AoDocument.origine == "rempli",
                )
            )
            await session.commit()

        if not docs:
            logger.info("[fill_docs] aucun upload ao_id=%s", ao_id)
            return {"ao_id": ao_id, "filled": 0}

        company_info = get_company_info(profile)
        settings = get_settings()
        filled_count = 0

        for doc in docs:
            try:
                pdf_bytes = mc.get_file_bytes(doc.minio_key)
                if not pdf_bytes:
                    continue

                result = await run_filler(
                    pdf_bytes=pdf_bytes,
                    filename=doc.nom_fichier,
                    company_case="societe",
                    lots=[],
                    api_key=settings.mistral_api_key,
                    org_id=org_id,
                    ao_id=ao_id,
                    company_info=company_info,
                )

                if not result.fichiers:
                    logger.info("[fill_docs] rien à remplir dans %s", doc.nom_fichier)
                    continue

                async with AsyncSessionLocal() as session:
                    for f in result.fichiers:
                        # Utiliser le dossier natif du filler (services existants)
                        _FINANCIER = {"acte_engagement", "bordereau_prix"}
                        _ADMIN     = {"declaration_honneur", "attestation_fiscale", "attestation_cnss"}
                        if f.doc_type in _FINANCIER:
                            dossier = "financier"
                        elif f.doc_type in _ADMIN:
                            dossier = "administratif"
                        else:
                            dossier = "source"

                        new_doc = AoDocument(
                            id=str(uuid.uuid4()),
                            ao_id=ao_id,
                            created_at=_now_iso(),
                            dossier=dossier,
                            doc_type=f.doc_type,
                            origine="rempli",
                            statut="traite",
                            minio_key=f.minio_key or f.download_url,
                            nom_fichier=f.filename,
                            taille_octets=0,
                        )
                        session.add(new_doc)
                    await session.commit()

                filled_count += len(result.fichiers)
                logger.info("[fill_docs] %d doc(s) rempli(s) depuis %s", len(result.fichiers), doc.nom_fichier)
            except Exception as exc:
                logger.error("[fill_docs] erreur doc=%s: %s", doc.id, exc)

        async with AsyncSessionLocal() as session:
            ao_res = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
            ao_obj = ao_res.scalar_one_or_none()
            if ao_obj:
                ao_obj.pipeline_pct = 70
                ao_obj.updated_at   = _now_iso()
            await session.commit()

        return {"ao_id": ao_id, "filled": filled_count}

    result = _run_async(_fill())
    advance_or_gate(ao_id, "remplissage")
    return result


# ---------------------------------------------------------------------------
# Phase 4e  Signature + compilation ZIP final
# ---------------------------------------------------------------------------

@shared_task(bind=True, name="app.tasks.ao_tasks.task_sign_and_compile", max_retries=2)
def task_sign_and_compile(self, ao_id: str) -> dict:
    """Signe les documents clés et compile un ZIP final dans MinIO."""
    logger.info("[sign_compile] début ao_id=%s", ao_id)
    _run_async(_set_pct(ao_id, 85))

    _DOCS_TO_SIGN       = {"acte_engagement", "declaration_honneur", "note_metho", "bordereau"}
    _DOCS_LU_ACCEPTE    = {"cps", "rc"}

    async def _sign_and_compile() -> dict:
        import io
        import zipfile
        from app.db.base import AsyncSessionLocal
        from app.db.models import AoDocument, AppelOffre, CompanyProfile, CompanyDocument
        from app.services.signing_service import sign_pdf
        from app.storage import minio_client as mc
        from sqlalchemy import select

        async with AsyncSessionLocal() as session:
            ao_res = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
            ao = ao_res.scalar_one_or_none()
            if not ao:
                raise ValueError(f"AO {ao_id} introuvable")
            org_id = ao.org_id

            docs_res = await session.execute(
                select(AoDocument).where(
                    AoDocument.ao_id == ao_id,
                    AoDocument.statut == "traite",
                    AoDocument.minio_key.isnot(None),
                    AoDocument.origine.in_(["genere", "rempli", "upload"]),
                )
            )
            docs = docs_res.scalars().all()

            # Charger signature + cachet de l'org
            profile_res = await session.execute(
                select(CompanyProfile).where(CompanyProfile.org_id == org_id)
            )
            profile = profile_res.scalar_one_or_none()

            # Charger les documents permanents de l'org (à inclure dans le ZIP)
            company_docs_res = await session.execute(
                select(CompanyDocument).where(
                    CompanyDocument.org_id == org_id,
                    CompanyDocument.minio_key.isnot(None),
                )
            )
            company_docs = company_docs_res.scalars().all()

        # Charger les bytes de signature/cachet/lu_et_accepte depuis MinIO
        sig_bytes = None
        cac_bytes = None
        lea_bytes = None  # lu_et_accepte image
        if profile:
            if profile.signature_minio_key:
                try:
                    sig_bytes = mc.get_file_bytes(profile.signature_minio_key)
                except Exception:
                    pass
            if profile.cachet_minio_key:
                try:
                    cac_bytes = mc.get_file_bytes(profile.cachet_minio_key)
                except Exception:
                    pass
            if profile.lu_et_accepte_minio_key:
                try:
                    lea_bytes = mc.get_file_bytes(profile.lu_et_accepte_minio_key)
                except Exception:
                    pass

        zip_buffer = io.BytesIO()
        signed_count = 0
        signed_updates: list[tuple[str, str]] = []  # (doc_id, new_minio_key)

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            # 1. Documents générés / remplis / uploadés pour cet AO
            for doc in docs:
                try:
                    key = doc.minio_key
                    if "?" in (key or ""):
                        key = key.split("?")[0].split("/offria/")[-1]
                    if not key:
                        continue

                    file_bytes = mc.get_file_bytes(key)

                    if key.endswith(".pdf"):
                        lu_et_accepte = doc.doc_type in _DOCS_LU_ACCEPTE
                        to_sign       = doc.doc_type in _DOCS_TO_SIGN or lu_et_accepte
                        if to_sign:
                            try:
                                from datetime import date
                                ville     = profile.ville if profile and profile.ville else ""
                                date_str  = date.today().strftime("%d/%m/%Y")
                                file_bytes = sign_pdf(
                                    file_bytes,
                                    signature_bytes=sig_bytes,
                                    cachet_bytes=cac_bytes,
                                    lu_et_accepte_bytes=lea_bytes,
                                    lu_et_accepte=lu_et_accepte,
                                    fait_a_lieu=ville,
                                    fait_a_date=date_str,
                                    paraphe=lu_et_accepte,
                                    cachet_seulement=not lu_et_accepte,  # acte/déclaration/note_metho : cachet uniquement
                                )
                                signed_count += 1
                                # Uploader la version signée et mettre à jour la DB
                                signed_key = f"{org_id}/ao/{ao_id}/signed/{doc.dossier}/{doc.nom_fichier or doc.id + '.pdf'}"
                                mc.upload_bytes(signed_key, file_bytes, "application/pdf")
                                signed_updates.append((doc.id, signed_key))
                            except Exception as exc:
                                logger.warning("[sign_compile] signature échouée doc=%s: %s", doc.id, exc)

                    folder   = doc.dossier
                    filename = doc.nom_fichier or f"{doc.id}.pdf"
                    zf.writestr(f"{folder}/{filename}", file_bytes)
                except Exception as exc:
                    logger.error("[sign_compile] erreur doc=%s: %s", doc.id, exc)

            # 2. Documents permanents de l'entreprise (attestations, gérance, etc.)
            _DOC_TYPE_DOSSIER = {
                "pouvoir_gerance":        "administratif",
                "attestation_fiscale":    "administratif",
                "attestation_cnas":       "administratif",
                "attestation_casnos":     "administratif",
                "reference_realisation":  "technique",
                "diplome":                "technique",
                "autre":                  "administratif",
            }
            for cdoc in company_docs:
                try:
                    file_bytes = mc.get_file_bytes(cdoc.minio_key)
                    dossier = _DOC_TYPE_DOSSIER.get(cdoc.doc_type, "administratif")
                    zf.writestr(f"{dossier}/{cdoc.nom_fichier}", file_bytes)
                except Exception as exc:
                    logger.warning("[sign_compile] doc entreprise ignoré %s: %s", cdoc.id, exc)

        zip_bytes = zip_buffer.getvalue()
        zip_key   = f"{org_id}/ao/{ao_id}/output/dossier_complet.zip"
        mc.upload_bytes(zip_key, zip_bytes, "application/zip")

        # Mettre à jour les minio_key des docs signés pour que l'UI serve la version signée
        if signed_updates:
            async with AsyncSessionLocal() as session:
                for doc_id, signed_key in signed_updates:
                    doc_res = await session.execute(select(AoDocument).where(AoDocument.id == doc_id))
                    doc_obj = doc_res.scalar_one_or_none()
                    if doc_obj:
                        doc_obj.minio_key = signed_key
                await session.commit()
            logger.info("[sign_compile] %d minio_key mis à jour vers versions signées", len(signed_updates))

        async with AsyncSessionLocal() as session:
            # Supprimer les anciens ZIPs pour éviter les doublons
            from sqlalchemy import delete as sa_delete
            await session.execute(
                sa_delete(AoDocument).where(
                    AoDocument.ao_id == ao_id,
                    AoDocument.doc_type == "zip_final",
                )
            )
            zip_doc = AoDocument(
                id=str(uuid.uuid4()),
                ao_id=ao_id,
                created_at=_now_iso(),
                dossier="output",
                doc_type="zip_final",
                origine="genere",
                statut="traite",
                minio_key=zip_key,
                nom_fichier="dossier_complet.zip",
                taille_octets=len(zip_bytes),
            )
            session.add(zip_doc)

            ao_res = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
            ao = ao_res.scalar_one_or_none()
            if ao:
                ao.statut       = "termine"
                ao.pipeline_pct = 100
                ao.updated_at   = _now_iso()
            await session.commit()

        logger.info("[sign_compile] ZIP créé (%d bytes), %d docs signés  ao_id=%s",
                    len(zip_bytes), signed_count, ao_id)
        return {"ao_id": ao_id, "zip_key": zip_key, "signed": signed_count, "statut": "termine"}

    result = _run_async(_sign_and_compile())
    # Étape terminale : pas de porte de validation, rien ne suit dans le parcours.
    # L'étape est marquée validée directement, l'AO est déjà passé à "termine".
    _run_async(mark_step(ao_id, "signature", "validee"))
    # Enchaîner l'indexation RAG après la compilation
    task_index_results.delay(ao_id)
    return result


# ---------------------------------------------------------------------------
# Enrichissement RAG  indexation dans kb_{org_id}
# ---------------------------------------------------------------------------

@shared_task(bind=True, name="app.tasks.ao_tasks.task_index_results", max_retries=1)
def task_index_results(self, ao_id: str) -> dict:
    """Indexe la note méthodologique dans kb_{org_id} pour enrichir le RAG."""
    logger.info("[index_results] début ao_id=%s", ao_id)

    async def _index() -> dict:
        from app.db.base import AsyncSessionLocal
        from app.db.models import AoDocument, AppelOffre
        from app.services.rag_service import RagService
        from app.storage import minio_client as mc
        from app.config.settings import get_settings
        from sqlalchemy import select
        import fitz

        async with AsyncSessionLocal() as session:
            ao_res = await session.execute(select(AppelOffre).where(AppelOffre.id == ao_id))
            ao = ao_res.scalar_one_or_none()
            if not ao:
                return {"ao_id": ao_id, "skipped": True}

            docs_res = await session.execute(
                select(AoDocument).where(
                    AoDocument.ao_id == ao_id,
                    AoDocument.doc_type == "note_metho",
                    AoDocument.statut == "traite",
                    AoDocument.minio_key.isnot(None),
                    AoDocument.nom_fichier.like("%.pdf"),
                )
            )
            note_docs = docs_res.scalars().all()
            org_id = ao.org_id
            analyse = ao.analyse_json or {}

        if not note_docs:
            logger.info("[index_results] pas de note métho à indexer ao_id=%s", ao_id)
            return {"ao_id": ao_id, "indexed": 0}

        settings = get_settings()
        rag = RagService(qdrant_url=settings.qdrant_url or "", mistral_api_key=settings.mistral_api_key)
        if not rag.is_ready:
            logger.warning("[index_results] RAG non disponible, skip indexation ao_id=%s", ao_id)
            return {"ao_id": ao_id, "indexed": 0}

        indexed = 0
        for doc in note_docs:
            try:
                pdf_bytes = mc.get_file_bytes(doc.minio_key)
                if not pdf_bytes:
                    continue
                with fitz.open(stream=pdf_bytes, filetype="pdf") as pdf:
                    text = "\n\n".join(page.get_text() for page in pdf)
                if not text.strip():
                    continue

                metadata = {
                    "ao_id":       ao_id,
                    "source":      "note_metho",
                    "acheteur":    ao.acheteur,
                    "objet":       ao.objet,
                    "strategie":   str(analyse.get("strategie_offre_technique", "")),
                    "criteres":    str(analyse.get("criteres_ponderation", "")),
                }
                await rag.index_document(
                    org_id=org_id,
                    text=text,
                    metadata=metadata,
                    doc_id=f"ao_{ao_id}_note_metho",
                )
                indexed += 1
                logger.info("[index_results] note métho indexée ao_id=%s org=%s", ao_id, org_id)
            except Exception as exc:
                logger.error("[index_results] erreur indexation doc=%s: %s", doc.id, exc)

        return {"ao_id": ao_id, "indexed": indexed}

    return _run_async(_index())
