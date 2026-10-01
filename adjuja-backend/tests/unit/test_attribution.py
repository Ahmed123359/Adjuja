"""Classement prévu selon le décret 2-22-431 (art. 43, 44, 144).

Chaque cas est calculé à la main dans son commentaire : le test vérifie la
règle, pas l'implémentation.
"""

from decimal import Decimal as D

import pytest

from app.services.attribution import Offre, classer


def _par_id(c):
    return {o.id: o for o in c.offres}


# ── Travaux : prix de référence (art. 44) ────────────────────────────────────

def test_travaux_cas_complet() -> None:
    # E = 1 000 000. A excessive (> 1 200 000), B anormalement basse (< 800 000).
    # Restent C 950 000, D 1 050 000, F 900 000 : moyenne 966 666,67.
    # P = (1 000 000 + 966 666,67) / 2 = 983 333,33.
    # Sous P : C (écart 33 333), F (83 333) ; au-dessus : D. Gagnante : C.
    offres = [
        Offre("A", "Alpha", D("1250000"), "admis"),
        Offre("B", "Beta", D("790000"), "admis"),
        Offre("C", "Gamma", D("950000"), "admis", est_nous=True),
        Offre("D", "Delta", D("1050000"), "admis"),
        Offre("F", "Phi", D("900000"), "admis"),
    ]
    c = classer("travaux", D("1000000"), offres)
    o = _par_id(c)
    assert c.calculable and c.prix_reference == D("983333.33")
    assert (o["A"].issue, o["B"].issue) == ("excessive", "anormalement_basse")
    assert (o["C"].rang, o["F"].rang, o["D"].rang) == (1, 2, 3)
    assert c.gagnante_id == "C" and o["C"].gagnante
    assert "anormalement_basse_sous_reserve" in c.avertissements


def test_aucune_offre_sous_le_prix_de_reference() -> None:
    # E = 1 000 000 ; offres 1 100 000 et 1 150 000 : moyenne 1 125 000,
    # P = 1 062 500. Aucune sous P : la plus proche par excès gagne.
    c = classer("travaux", D("1000000"), [
        Offre("X", "X", D("1150000"), "admis"), Offre("Y", "Y", D("1100000"), "admis"),
    ])
    assert c.prix_reference == D("1062500.00") and c.gagnante_id == "Y"


def test_une_offre_sous_p_passe_devant_une_plus_proche_au_dessus() -> None:
    # E = 100 ; offres 90 et 101 : moyenne 95,5, P = 97,75. 90 est à 7,75
    # sous P, 101 à 3,25 au-dessus : la mieux-disante est 90 (« par défaut »).
    c = classer("travaux", D("100"), [Offre("a", "a", D("90"), "admis"), Offre("b", "b", D("101"), "admis")])
    assert c.prix_reference == D("97.75") and c.gagnante_id == "a"


def test_seuil_bas_fournitures_et_services_25_pct() -> None:
    # E = 100 000 ; 78 000 est à -22 % : écartée en travaux (seuil 20 %),
    # gardée en fournitures et services (seuil 25 %).
    offres = [Offre("o", "o", D("78000"), "admis"), Offre("p", "p", D("100000"), "admis")]
    assert _par_id(classer("travaux", D("100000"), offres))["o"].issue == "anormalement_basse"
    for nature in ("fournitures", "services"):
        assert _par_id(classer(nature, D("100000"), offres))["o"].issue == "retenue"


def test_ecartes_par_la_commission_et_sans_montant() -> None:
    c = classer("travaux", D("100"), [
        Offre("a", "a", D("95"), "ecarte_administratif"),
        Offre("b", "b", D("96"), "ecarte_technique"),
        Offre("c", "c", None, "admis"),
        Offre("d", "d", D("99"), "admis"),
    ])
    o = _par_id(c)
    assert [o[k].issue for k in "abc"] == ["ecarte_administratif", "ecarte_technique", "sans_montant"]
    assert c.gagnante_id == "d"


def test_statut_inconnu_suppose_admis() -> None:
    c = classer("travaux", D("100"), [Offre("a", "a", D("99"))])
    assert c.gagnante_id == "a" and "statuts_supposes_admis" in c.avertissements


def test_ex_aequo_signale() -> None:
    c = classer("fournitures", D("100"), [Offre("a", "a", D("95"), "admis"), Offre("b", "b", D("95"), "admis")])
    o = _par_id(c)
    assert o["a"].rang == o["b"].rang == 1 and "ex_aequo" in c.avertissements


@pytest.mark.parametrize("estimation,offres,raison", [
    (None, [Offre("a", "a", D("1"), "admis")], "estimation_manquante"),
    (D("100"), [], "aucune_offre"),
    (D("100"), [Offre("a", "a", D("200"), "admis")], "aucune_offre_retenue"),
])
def test_non_calculable(estimation, offres, raison: str) -> None:
    c = classer("travaux", estimation, offres)
    assert not c.calculable and c.raison == raison and c.gagnante_id is None


# ── Gardiennage, nettoyage, espaces verts : taux de majoration (art. 43) ────

def test_gardiennage_taux_le_plus_faible() -> None:
    # E = 100 000 ; 110 000 (+10 %) et 105 000 (+5 %) : 105 000 gagne.
    c = classer("gardiennage_nettoyage", D("100000"), [
        Offre("a", "a", D("110000"), "admis"), Offre("b", "b", D("105000"), "admis"),
    ])
    o = _par_id(c)
    assert c.gagnante_id == "b" and o["b"].taux_majoration_pct == D("5.00")
    assert c.prix_reference is None


# ── Études : note technico-financière (art. 144) ─────────────────────────────

def test_etudes_note_technico_financiere() -> None:
    # E = 500 000, poids financier 30, seuil technique 70.
    # C (note 65) sous le seuil ; D 360 000 < 375 000 (−25 %) anormalement basse.
    # Restent A (85 ; 450 000) et B (90 ; 500 000). Moins-disant 450 000.
    # Nf A = 100, Nf B = 100 × 450/500 = 90.
    # NG A = 85 × 0,7 + 100 × 0,3 = 89,5 ; NG B = 90 × 0,7 + 90 × 0,3 = 90. B gagne.
    c = classer("etudes", D("500000"), [
        Offre("A", "A", D("450000"), "admis", note_technique=D("85")),
        Offre("B", "B", D("500000"), "admis", note_technique=D("90")),
        Offre("C", "C", D("400000"), "admis", note_technique=D("65")),
        Offre("D", "D", D("360000"), "admis", note_technique=D("80")),
    ], poids_financier=D("30"), seuil_technique=D("70"))
    o = _par_id(c)
    assert (o["C"].issue, o["D"].issue) == ("sous_seuil_technique", "anormalement_basse")
    assert (o["A"].note_financiere, o["B"].note_financiere) == (D("100.00"), D("90.00"))
    assert (o["A"].note_globale, o["B"].note_globale) == (D("89.50"), D("90.00"))
    assert c.gagnante_id == "B"


@pytest.mark.parametrize("poids,raison", [(None, "ponderation_manquante"), (D("50"), "ponderation_hors_bornes")])
def test_etudes_ponderation_requise(poids, raison: str) -> None:
    c = classer("etudes", D("100"), [Offre("a", "a", D("100"), "admis", note_technique=D("80"))], poids_financier=poids)
    assert c.raison == raison


def test_etudes_notes_techniques_manquantes() -> None:
    c = classer("etudes", D("100"), [Offre("a", "a", D("100"), "admis")], poids_financier=D("30"))
    assert c.raison == "notes_techniques_manquantes"


def test_nature_inconnue() -> None:
    with pytest.raises(ValueError):
        classer("concession", D("1"), [])
