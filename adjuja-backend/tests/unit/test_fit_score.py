"""Fit score : facteurs, renormalisation, barriere, repli sans embeddings.
Spec : context/feature-spec/fit-score/api.md (« Check when done »)."""

import asyncio
from datetime import date
from types import SimpleNamespace

import pytest

from app.services import fit_score_service as fs
from app.services.fit_score_service import AoContext, FitScoreService


def _profil(**extra_fields):
    base = dict(ice="001", rc="123", if_fiscal="456", cnss="789", ville="Rabat")
    extra = extra_fields.pop("extra", {})
    base.update(extra_fields)
    return SimpleNamespace(extra=extra, **base)


def _attestation(fin="2099-01-01"):
    return SimpleNamespace(doc_type="attestation_fiscale", date_validite=fin)


@pytest.fixture(autouse=True)
def _sans_redis(monkeypatch):
    memo: dict = {}
    monkeypatch.setattr(fs.cache, "get", lambda k: memo.get(k))
    monkeypatch.setattr(fs.cache, "set", lambda k, v, ttl=0: memo.__setitem__(k, v))


def _run(coro):
    return asyncio.run(coro)


# ── Facteurs ────────────────────────────────────────────────────────────────

def test_facteur_non_exige_est_ecarte():
    f = fs.facteur_capacite_financiere({}, {"chiffre_affaires_moyen": "1000"})
    assert f["exige"] is False and f["score"] is None


def test_capacite_proportionnelle_et_ca_absent():
    analyse = {"chiffre_affaires_minimum_exige": 1_000_000}
    assert fs.facteur_capacite_financiere(analyse, {"chiffre_affaires_moyen": "500000"})["score"] == 50
    absent = fs.facteur_capacite_financiere(analyse, {})
    assert absent["score"] == 0 and absent["confiance"] == "faible"
    assert absent["action"] == {"cible": "profil", "champ": "chiffre_affaires_moyen"}


def test_qualification_seule_vaut_75_si_domaine_trouve():
    analyse = {"qualification_requise": "Batiment classe 3"}
    f = fs.facteur_qualifications(analyse, {"classifications": [{"domaine": "batiment"}]})
    assert f["score"] == 75 and f["confiance"] == "moyenne"


def test_equipe_compare_poste_et_experience():
    analyse = {"profils_requis": [
        {"poste": "Chef de projet", "specialite": "genie civil", "annees_experience_min": 10},
        {"poste": "Topographe", "annees_experience_min": 3},
    ]}
    staff = [SimpleNamespace(poste="Chef de projet", specialite="Génie civil", annees_experience=12, actif=True),
             SimpleNamespace(poste="Topographe", specialite="", annees_experience=1, actif=True)]
    f = fs.facteur_equipe(analyse, staff)
    assert f["score"] == 50 and "Topographe" in f["justification"]


def test_conformite_attestation_expiree():
    f = fs.facteur_conformite(_profil(), [_attestation("2020-01-01")], aujourdhui=date(2026, 9, 27))
    assert f["score"] == 80 and f["action"] == {"cible": "documents", "champ": None}


def test_proximite_meme_ville_ou_non():
    p = _profil(ville="Rabat")
    assert fs.facteur_proximite(AoContext(region="RABAT"), p)["score"] == 100
    assert fs.facteur_proximite(AoContext(region="TAZA"), p)["score"] == 40
    assert fs.facteur_proximite(AoContext(), p)["exige"] is False


# ── Assemblage ──────────────────────────────────────────────────────────────

def test_renormalisation_sur_les_seuls_facteurs_exiges():
    facteurs = [
        fs._facteur("qualifications", 100, ""),        # poids 30
        fs._facteur("capacite_financiere", None, ""),  # ecarte
        fs._facteur("references", 50, ""),             # poids 20
        fs._facteur("equipe", None, ""),
        fs._facteur("conformite_administrative", None, ""),
        fs._facteur("proximite", None, ""),
    ]
    r = fs.assembler(facteurs, {"bloquants": [], "avertissements": []}, "embeddings")
    assert r["score"] == round((30 * 100 + 20 * 50) / 50)  # 80
    assert r["eligibilite"] == "eligible"


def test_aucun_facteur_exige_donne_un_score_nul_et_non_zero():
    facteurs = [fs._facteur(code, None, "") for code in fs.POIDS]
    assert fs.assembler(facteurs, {}, "mots_cles")["score"] is None


def test_certification_manquante_bloque_sans_annuler_le_score():
    analyse = {"certifications_requises": ["ISO 9001"], "chiffre_affaires_minimum_exige": 100}
    profil = _profil(extra={"chiffre_affaires_moyen": "500"})
    r = _run(FitScoreService(None).compute(analyse, AoContext(region="Rabat"), profil, [], [_attestation()], "org"))
    assert r["eligibilite"] == "non_eligible"
    assert any("ISO 9001" in b for b in r["bloquants"])
    assert r["score"] and r["score"] > 0


def test_qualification_introuvable_ne_bloque_jamais():
    analyse = {"qualification_requise": "Travaux routiers classe 1"}
    r = _run(FitScoreService(None).compute(analyse, AoContext(), _profil(), [], [_attestation()], "org"))
    assert r["eligibilite"] == "a_verifier" and r["bloquants"] == []


# ── References ──────────────────────────────────────────────────────────────

class _FauxEmbedder:
    """Vecteurs jouets : proche si le texte parle d'irrigation."""

    def __init__(self, docs=None, echoue=False):
        self.docs = docs or []
        self.echoue = echoue
        self.appels = 0

    async def embed(self, text):
        self.appels += 1
        if self.echoue:
            raise RuntimeError("cle invalide")
        return [1.0, 0.0] if "irrigation" in text.lower() else [0.0, 1.0]

    async def search_org(self, org_id, vector, doc_types, limit=10):
        assert doc_types == ["reference_realisation"]
        return self.docs


def test_references_par_embeddings_et_cache():
    analyse = {"contexte": {"objet": "Réseau d'irrigation goutte à goutte"},
               "nombre_references_similaires_exige": 2}
    extra = {"references_similaires": [{"intitule": "Irrigation du périmètre de Tadla"},
                                       {"intitule": "Construction d'une école"}]}
    emb = _FauxEmbedder(docs=[(0.91, {"nom_fichier": "attestation-irrigation.pdf"})])
    svc = FitScoreService(emb)
    r = _run(svc.compute(analyse, AoContext(), _profil(extra=extra), [], [_attestation()], "org"))
    ref = next(f for f in r["facteurs"] if f["code"] == "references")
    assert r["methode_references"] == "embeddings"
    assert ref["score"] == 100 and ref["confiance"] == "haute"
    appels = emb.appels
    _run(svc.compute(analyse, AoContext(), _profil(extra=extra), [], [_attestation()], "org"))
    assert emb.appels == appels, "les embeddings deja calcules doivent venir du cache"


def test_repli_mots_cles_sans_cle():
    analyse = {"contexte": {"objet": "Réhabilitation du réseau d'irrigation de Tadla"}}
    extra = {"references_similaires": [{"intitule": "Réseau d'irrigation du périmètre de Tadla"}]}
    r = _run(FitScoreService(_FauxEmbedder(echoue=True)).compute(
        analyse, AoContext(), _profil(extra=extra), [], [_attestation()], "org"))
    ref = next(f for f in r["facteurs"] if f["code"] == "references")
    assert r["methode_references"] == "mots_cles"
    assert ref["confiance"] == "faible" and ref["score"] > 0


def test_references_exigees_mais_aucune_au_profil():
    analyse = {"contexte": {"objet": "x"}, "nombre_references_similaires_exige": 3}
    r = _run(FitScoreService(None).compute(analyse, AoContext(), _profil(), [], [_attestation()], "org"))
    ref = next(f for f in r["facteurs"] if f["code"] == "references")
    assert ref["score"] == 0 and ref["action"]["champ"] == "references_similaires"
