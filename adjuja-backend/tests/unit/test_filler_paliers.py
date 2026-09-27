"""Remplissage par paliers (spec fournisseurs-ia) : reconstruction de la page
OCR et choix du palier. Aucun appel reseau ni Tesseract."""

from pathlib import Path

from app.services.filler import filler_llm, filler_ocr_layout as ocr


def _mot(bloc, par, ligne, texte, conf="95"):
    return {"level": "5", "block_num": str(bloc), "par_num": str(par), "line_num": str(ligne),
            "text": texte, "conf": conf}


def test_reconstruction_par_blocs_et_lignes():
    tsv = [
        _mot(1, 1, 1, "ACTE"), _mot(1, 1, 1, "D'ENGAGEMENT"),
        {"level": "4", "block_num": "1", "par_num": "1", "line_num": "1", "text": "", "conf": "-1"},
        _mot(2, 1, 1, "Je"), _mot(2, 1, 1, "soussigne"), _mot(2, 1, 1, "........"),
        _mot(2, 1, 2, "(prenom,"), _mot(2, 1, 2, "nom", "40"),
    ]
    texte, confs = ocr.reconstruire_page(tsv)
    assert texte == "ACTE D'ENGAGEMENT\n\nJe soussigne ........\n(prenom, nom"
    assert len(confs) == 7 and min(confs) == 40


def test_garde_de_fiabilite():
    assert ocr.LectureOcr("x", confiance=85, mots=500).fiable
    assert not ocr.LectureOcr("x", confiance=50, mots=500).fiable
    assert not ocr.LectureOcr("x", confiance=95, mots=5).fiable


def _brancher(monkeypatch, lecture, reponse_texte='{"paragraphs":[{"type":"body","text":"rempli"}]}'):
    appels = {"texte": 0, "vision": 0}
    monkeypatch.setattr(filler_llm, "_rendre_pages", lambda *a, **k: ["img"])
    monkeypatch.setattr(ocr, "lire_pages", lambda images: lecture)

    def texte(*a, **k):
        appels["texte"] += 1
        return reponse_texte

    def vision(*a, **k):
        appels["vision"] += 1
        return '{"paragraphs":[{"type":"body","text":"lu par vision"}]}'

    monkeypatch.setattr(filler_llm, "texte_json", texte)
    monkeypatch.setattr(filler_llm, "vision_json", vision)
    return appels


def test_ocr_fiable_reste_au_palier_texte(monkeypatch):
    appels = _brancher(monkeypatch, ocr.LectureOcr("Je soussigne ....", 88, 400))
    paras, palier = filler_llm.lire_et_remplir_scan(Path("x.pdf"), [0], "SYS", {"ice": "1"})
    assert palier == "ocr" and paras[0]["text"] == "rempli"
    assert appels == {"texte": 1, "vision": 0}


def test_ocr_faible_passe_a_la_vision(monkeypatch):
    appels = _brancher(monkeypatch, ocr.LectureOcr("??", 41, 400))
    paras, palier = filler_llm.lire_et_remplir_scan(Path("x.pdf"), [0], "SYS", {})
    assert palier == "vision" and appels == {"texte": 0, "vision": 1}


def test_reponse_texte_inexploitable_passe_a_la_vision(monkeypatch):
    appels = _brancher(monkeypatch, ocr.LectureOcr("texte", 90, 400), reponse_texte="pas du json")
    _, palier = filler_llm.lire_et_remplir_scan(Path("x.pdf"), [0], "SYS", {})
    assert palier == "vision" and appels == {"texte": 1, "vision": 1}
