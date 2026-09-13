"""Tests de l'assemblage multi-lots de task_analyze_ao_context.

Deux défauts corrigés le 2026-09-13 : les lots 2+ (`cps_2`, `cps_3`) étaient
ignorés, et plusieurs CPS de même type s'écrasaient l'un l'autre (seul le dernier
était analysé). Les fonctions sont pures : testées sans base, MinIO ni LLM.
"""
from dataclasses import dataclass

from app.tasks.ao_tasks import _assemble_lots, _lot_rank


@dataclass
class Doc:
    doc_type: str
    texte: str
    id: str = "d"


def lire(doc: Doc) -> str:
    return doc.texte


class TestLotRank:

    def test_type_nu_est_le_lot_1(self):
        assert _lot_rank("cps", "cps") == 1

    def test_type_suffixe_donne_son_rang(self):
        assert _lot_rank("cps_3", "cps") == 3

    def test_autre_type_ignore(self):
        assert _lot_rank("rc", "cps") is None
        assert _lot_rank("autre_doc_1", "cps") is None

    def test_prefixe_voisin_non_confondu(self):
        assert _lot_rank("cps_annexe", "cps") is None

    def test_type_absent_ne_leve_pas(self):
        assert _lot_rank(None, "cps") is None


class TestAssembleLots:

    def test_aucun_document_du_type(self):
        texte, meta = _assemble_lots([Doc("rc", "x")], "cps", 60000, lire)
        assert texte == ""
        assert meta == {"lots": 0}

    def test_mono_lot_sans_entete(self):
        texte, meta = _assemble_lots([Doc("cps", "contenu")], "cps", 60000, lire)
        assert texte == "contenu"
        assert meta["lots"] == 1
        assert meta["caracteres_perdus"] == 0

    def test_les_lots_2_et_suivants_sont_lus(self):
        docs = [Doc("cps", "LOT1"), Doc("cps_2", "LOT2"), Doc("cps_3", "LOT3"), Doc("rc", "R")]
        texte, meta = _assemble_lots(docs, "cps", 60000, lire)
        assert "LOT1" in texte and "LOT2" in texte and "LOT3" in texte
        assert meta["types"] == ["cps", "cps_2", "cps_3"]

    def test_ordre_des_lots_respecte_meme_si_desordonnes(self):
        # Marqueurs en minuscules : absents des en-têtes "--- CPS_2 (2/3) ---".
        docs = [Doc("cps_3", "troisieme"), Doc("cps", "premier"), Doc("cps_2", "deuxieme")]
        texte, _ = _assemble_lots(docs, "cps", 60000, lire)
        assert texte.index("premier") < texte.index("deuxieme") < texte.index("troisieme")

    def test_plusieurs_cps_de_meme_type_ne_s_ecrasent_plus(self):
        # Ancien comportement : cps_text = text[:60000] dans la boucle -> seul le dernier restait.
        docs = [Doc("cps", "PREMIER"), Doc("cps", "SECOND")]
        texte, meta = _assemble_lots(docs, "cps", 60000, lire)
        assert "PREMIER" in texte and "SECOND" in texte
        assert meta["lots"] == 2

    def test_troncature_visible_et_budget_reparti(self):
        docs = [Doc("cps", "a" * 50000), Doc("cps_2", "b" * 50000)]
        texte, meta = _assemble_lots(docs, "cps", 60000, lire)
        # budget 60000 réparti sur 2 lots -> 30000 chacun, 20000 perdus par lot
        assert meta["caracteres_perdus"] == 40000
        assert texte.count("a") == 30000 and texte.count("b") == 30000

    def test_part_minimale_garantie_sur_nombreux_lots(self):
        docs = [Doc(f"cps_{i}" if i > 1 else "cps", "x" * 5000) for i in range(1, 31)]
        _, meta = _assemble_lots(docs, "cps", 60000, lire)
        # 60000 / 30 = 2000 < plancher de 4000 : chaque lot garde au moins 4000
        assert meta["caracteres_perdus"] == 30 * 1000
