"""Remplacement d'un document produit par la version corrigee (mode accompagne,
etapes 5 et 6) et controle d'appartenance de la route equipe.

Base reelle (migrations appliquees, comme en CI) ; MinIO et LibreOffice simules.
"""

import io
import uuid
import zipfile
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.dependencies import get_current_user
from app.db.base import AsyncSessionLocal, engine
from app.db.models import AoDocument, AoPipelineStep, AppelOffre, Organization, User
from app.main import app
from app.models.user import UserPublic
from app.services import remplacement_document as rd

PDF = b"%PDF-1.4 version corrigee"


def _docx() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("word/document.xml", "<w:document/>")
    return buf.getvalue()


def _maintenant() -> str:
    return datetime.now(timezone.utc).isoformat()


@pytest.fixture(autouse=True)
async def _fermer_pool():
    # Chaque test a sa propre boucle : un pool garde entre deux boucles leve
    # « attached to a different loop ».
    yield
    await engine.dispose()


@pytest.fixture
def televersements(monkeypatch):
    from app.storage import minio_client

    envoyes: list[str] = []
    monkeypatch.setattr(minio_client, "upload_bytes", lambda cle, octets, mime: envoyes.append(cle))
    return envoyes


async def _creer_ao(statut_etape: str = "attente_validation") -> tuple[str, str]:
    """Organisation + AO avec une note generee (PDF et Word) et un CPS source."""
    user_id, org_id, ao_id = (str(uuid.uuid4()) for _ in range(3))
    async with AsyncSessionLocal() as s:
        s.add(User(id=user_id, nom="N", prenom="P", email=f"{user_id}@test.ma", hashed_pwd="x", created_at=_maintenant()))
        await s.flush()
        s.add(Organization(id=org_id, owner_id=user_id, name="Org", slug=org_id, created_at=_maintenant()))
        s.add(AppelOffre(id=ao_id, org_id=org_id, user_id=user_id, created_at=_maintenant(), updated_at=_maintenant(), mode="accompagne"))
        await s.flush()
        for ext in ("pdf", "docx"):
            s.add(AoDocument(id=str(uuid.uuid4()), ao_id=ao_id, created_at=_maintenant(), dossier="technique",
                             doc_type="note_metho", origine="genere", statut="traite",
                             minio_key=f"{org_id}/ao/{ao_id}/technique/note.{ext}", nom_fichier=f"note.{ext}"))
        s.add(AoDocument(id=str(uuid.uuid4()), ao_id=ao_id, created_at=_maintenant(), dossier="source",
                         doc_type="cps", origine="upload", statut="traite", minio_key="k/cps.pdf", nom_fichier="cps.pdf"))
        s.add(AoPipelineStep(id=str(uuid.uuid4()), ao_id=ao_id, step_key="redaction", step_order=5, statut=statut_etape))
        await s.commit()
    return org_id, ao_id


async def _documents(ao_id: str) -> list[AoDocument]:
    async with AsyncSessionLocal() as s:
        return list((await s.execute(select(AoDocument).where(AoDocument.ao_id == ao_id))).scalars().all())


# ── Type de fichier ──────────────────────────────────────────────────────────

def test_type_fichier_d_apres_le_contenu():
    assert rd.type_fichier(PDF) == "pdf"
    assert rd.type_fichier(_docx()) == "docx"
    zip_quelconque = io.BytesIO()
    with zipfile.ZipFile(zip_quelconque, "w") as zf:
        zf.writestr("autre.txt", "x")
    assert rd.type_fichier(zip_quelconque.getvalue()) is None
    assert rd.type_fichier(b"<html>") is None
    assert rd.type_fichier(b"PK\x03\x04 pas un zip") is None


# ── Remplacement ─────────────────────────────────────────────────────────────

async def test_pdf_remplace_toutes_les_versions_generees(televersements):
    org_id, ao_id = await _creer_ao()
    resultat = await rd.remplacer_document(ao_id, org_id, "note_metho", "ma_note.pdf", PDF)

    assert resultat.signable is True
    docs = await _documents(ao_id)
    notes = [d for d in docs if d.doc_type == "note_metho"]
    assert [(d.origine, d.nom_fichier) for d in notes] == [("modifie", "ma_note.pdf")]
    assert notes[0].dossier == "technique"
    # Le document source n'est jamais touche.
    assert any(d.doc_type == "cps" and d.origine == "upload" for d in docs)
    assert televersements == [f"{org_id}/ao/{ao_id}/technique/modifie/note_metho.pdf"]


async def test_word_converti_en_pdf_pour_etre_signe(televersements, monkeypatch):
    monkeypatch.setattr(rd, "_docx_vers_pdf", lambda data: PDF)
    org_id, ao_id = await _creer_ao()
    resultat = await rd.remplacer_document(ao_id, org_id, "note_metho", "ma_note.docx", _docx())

    assert resultat.signable is True
    notes = sorted(d.nom_fichier for d in await _documents(ao_id) if d.doc_type == "note_metho")
    assert notes == ["ma_note.docx", "ma_note.pdf"]


async def test_word_sans_conversion_signale_non_signable(televersements, monkeypatch):
    monkeypatch.setattr(rd, "_docx_vers_pdf", lambda data: None)
    org_id, ao_id = await _creer_ao()
    resultat = await rd.remplacer_document(ao_id, org_id, "note_metho", "ma_note.docx", _docx())
    assert resultat.signable is False


async def test_second_remplacement_retire_le_premier(televersements):
    org_id, ao_id = await _creer_ao()
    await rd.remplacer_document(ao_id, org_id, "note_metho", "v1.pdf", PDF)
    await rd.remplacer_document(ao_id, org_id, "note_metho", "v2.pdf", PDF)
    notes = [d.nom_fichier for d in await _documents(ao_id) if d.doc_type == "note_metho"]
    assert notes == ["v2.pdf"]


@pytest.mark.parametrize(
    "cas, code",
    [("etape_en_cours", 409), ("autre_org", 404), ("type_absent", 404), ("fichier_invalide", 400)],
)
async def test_refus(televersements, cas, code):
    org_id, ao_id = await _creer_ao(statut_etape="en_cours" if cas == "etape_en_cours" else "attente_validation")
    args = {"ao_id": ao_id, "org_id": org_id, "doc_type": "note_metho", "nom_fichier": "x.pdf", "data": PDF}
    if cas == "autre_org":
        args["org_id"] = str(uuid.uuid4())
    if cas == "type_absent":
        args["doc_type"] = "bordereau"
    if cas == "fichier_invalide":
        args["data"] = b"<html>pas un document</html>"

    with pytest.raises(rd.RemplacementRefuse) as exc:
        await rd.remplacer_document(**args)
    assert exc.value.code == code
    # Refus : rien n'a ete retire.
    assert len([d for d in await _documents(ao_id) if d.doc_type == "note_metho"]) == 2
    assert televersements == []


# ── Route equipe : controle d'appartenance ───────────────────────────────────

def _equipe_vue_par(org_id: str, ao_id: str) -> int:
    utilisateur = UserPublic(id="u", org_id=org_id, nom="N", prenom="P", email="u@test.ma", created_at=_maintenant())
    app.dependency_overrides[get_current_user] = lambda: utilisateur
    try:
        with TestClient(app) as client:
            return client.get(f"/api/v1/staff-cvs/ao/{ao_id}/team").status_code
    finally:
        app.dependency_overrides.pop(get_current_user, None)


async def test_equipe_d_un_ao_d_une_autre_organisation_introuvable():
    org_id, ao_id = await _creer_ao()
    await engine.dispose()
    assert _equipe_vue_par(str(uuid.uuid4()), ao_id) == 404
    # Contre-epreuve : le proprietaire y accede (le 404 ne vient pas d'une
    # mauvaise adresse de route).
    assert _equipe_vue_par(org_id, ao_id) == 200
