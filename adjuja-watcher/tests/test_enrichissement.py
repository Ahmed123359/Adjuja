"""Tests des fonctions pures de l'analyse AO enrichie.

MEMES CAS des deux cotes (copie miroir du module) :
  adjuja-backend/tests/unit/test_analyse_enrichissement.py
  adjuja-watcher/tests/test_enrichissement.py
Seule la ligne d'import differe.
"""

import pytest

from app.modules.ao_scraper.enrichissement import (
    PLAFONDS,
    calculer_gravite,
    normaliser_analyse,
    normaliser_risques,
    prioriser_articles,
)


# ── Gravite ──────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "probabilite, impact, attendu",
    [
        ("forte", "fort", "critique"),
        ("forte", "moyen", "elevee"),
        ("forte", "faible", "moderee"),
        ("moyenne", "fort", "elevee"),
        ("moyenne", "moyen", "moderee"),
        ("moyenne", "faible", "faible"),
        ("faible", "fort", "moderee"),
        ("faible", "moyen", "faible"),
        ("faible", "faible", "faible"),
    ],
)
def test_gravite_les_neuf_combinaisons(probabilite, impact, attendu):
    assert calculer_gravite(probabilite, impact) == attendu


def test_gravite_valeur_hors_liste():
    with pytest.raises(KeyError):
        calculer_gravite("certaine", "fort")


# ── Normalisation des risques ────────────────────────────────────────────────

def _risque(**champs):
    base = {"type": "penalites", "titre": "t", "clause": "c", "reference": "CPS, art. 1",
            "probabilite": "moyenne", "impact": "fort", "conseil": "x"}
    base.update(champs)
    return base


def test_gravite_du_modele_toujours_ecrasee():
    retenus, _ = normaliser_risques([_risque(probabilite="faible", impact="faible", gravite="critique")])
    assert retenus[0]["gravite"] == "faible"


def test_risque_hors_liste_ecarte_et_compte():
    retenus, ecartes = normaliser_risques([
        _risque(),
        _risque(type="juridique"),
        _risque(probabilite="certaine"),
        "pas un dict",
    ])
    assert len(retenus) == 1
    assert ecartes == 3


def test_accents_casse_et_genre_toleres():
    retenus, ecartes = normaliser_risques([
        _risque(type="Pénalités", probabilite="Moyen", impact="FORTE"),
        _risque(type="capacite technique", probabilite="forte", impact="moyen"),
    ])
    assert ecartes == 0
    assert {r["type"] for r in retenus} == {"penalites", "capacite_technique"}
    assert retenus[0]["gravite"] == "elevee"


def test_tri_par_gravite_puis_type_et_plafond():
    risques = [_risque(type="administratif", probabilite="faible", impact="faible") for _ in range(12)]
    risques.append(_risque(type="delai", probabilite="forte", impact="fort"))
    risques.append(_risque(type="financier", probabilite="forte", impact="fort"))
    retenus, _ = normaliser_risques(risques)
    assert len(retenus) == PLAFONDS["risques"]
    assert [r["type"] for r in retenus[:2]] == ["financier", "delai"]
    assert retenus[0]["gravite"] == "critique"


def test_risques_non_liste():
    assert normaliser_risques(None) == ([], 0)
    assert normaliser_risques("texte") == ([], 0)


# ── Normalisation de l'analyse ───────────────────────────────────────────────

def test_ancienne_analyse_sans_nouvelles_cles_inchangee():
    ancienne = {"contexte": {"objet": "x"}, "profils_requis": []}
    assert normaliser_analyse(dict(ancienne)) == ancienne


def test_cles_existantes_intactes():
    analyse = normaliser_analyse({"criteres_ponderation": [{"nom": "tech", "poids": 60}], "risques": []})
    assert analyse["criteres_ponderation"] == [{"nom": "tech", "poids": 60}]
    assert analyse["risques"] == []


def test_listes_plafonnees_et_filtrees():
    analyse = normaliser_analyse({
        "questions_moa": [{"question": str(i)} for i in range(20)] + ["pas un dict"],
        "clauses_a_surveiller": "pas une liste",
    })
    assert len(analyse["questions_moa"]) == PLAFONDS["questions_moa"]
    assert analyse["clauses_a_surveiller"] == []


def test_type_de_jalon_inconnu_devient_autre():
    analyse = normaliser_analyse({"jalons": [{"libelle": "a", "type": "Visite"}, {"libelle": "b", "type": "reunion"}]})
    assert [j["type"] for j in analyse["jalons"]] == ["visite", "autre"]


def test_budget_mal_forme_devient_null():
    assert normaliser_analyse({"decomposition_budgetaire": "1 000 000"})["decomposition_budgetaire"] is None
    assert normaliser_analyse({"decomposition_budgetaire": None})["decomposition_budgetaire"] is None


def test_risques_ecartes_notes_dans_la_meta():
    analyse = normaliser_analyse({"risques": [_risque(), _risque(type="juridique")]})
    assert analyse["_analyse_meta"]["risques_ecartes"] == 1


# ── Priorisation des articles ────────────────────────────────────────────────

def _cps(corps_par_article: list[str], preambule: str = "ROYAUME DU MAROC\nCPS du marche\n") -> str:
    return preambule + "".join(f"Article {i + 1} : {c}\n" for i, c in enumerate(corps_par_article))


def test_texte_dans_le_budget_rendu_tel_quel():
    texte = _cps(["objet", "delais", "penalites"])
    rendu, meta = prioriser_articles(texte, 10_000)
    assert rendu == texte
    assert meta == {"methode": "complet", "caracteres_perdus": 0}


def test_document_sans_articles_coupe_simple():
    texte = "x" * 5000
    rendu, meta = prioriser_articles(texte, 1000)
    assert rendu == "x" * 1000
    assert meta == {"methode": "coupe", "caracteres_perdus": 4000}


def test_article_de_penalites_en_fin_de_document_garde():
    remplissage = ["Dispositions generales sans interet particulier. " * 40 for _ in range(8)]
    penalites = "Penalites de retard : 1/1000 par jour de retard, sans plafond. Retenue de garantie 7 %."
    texte = _cps(remplissage + [penalites])
    rendu, meta = prioriser_articles(texte, 6000)
    assert "Penalites de retard" in rendu
    assert meta["methode"] == "articles"
    assert "9" not in meta["articles_ecartes"]
    assert len(rendu) <= 6000


def test_ordre_du_document_conserve_et_preambule_garde():
    articles = ["Objet du marche " + "a" * 900, "Delai d'execution : 6 mois. Penalites " + "b" * 900,
                "Divers " + "c" * 900, "Caution et paiement " + "d" * 900]
    texte = _cps(articles)
    rendu, meta = prioriser_articles(texte, 2600)
    assert rendu.startswith("ROYAUME DU MAROC")
    positions = [rendu.find(f"Article {n} :") for n in ("2", "4") if f"Article {n} :" in rendu]
    assert positions == sorted(positions)
    assert meta["articles_total"] == 4
    assert meta["articles_gardes"] + len(meta["articles_ecartes"]) == 4


def test_meta_exacte():
    texte = _cps(["a" * 3000, "Penalites " + "b" * 3000, "c" * 3000, "d" * 3000])
    rendu, meta = prioriser_articles(texte, 4000)
    assert meta["caracteres_perdus"] == len(texte) - len(rendu)
    assert set(meta["articles_ecartes"]) | {"2"} == {"1", "2", "3", "4"}


def test_entetes_variantes_reconnus():
    texte = "Preambule\n" + "".join(
        f"{entete} {i} : " + "z" * 500 + "\n"
        for i, entete in enumerate(("ARTICLE", "Art.", "Article n°", "article"), start=1)
    )
    _, meta = prioriser_articles(texte, 1200)
    assert meta["methode"] == "articles"
    assert meta["articles_total"] == 4


# ── Fusion de la re-analyse ──────────────────────────────────────────────────

from app.modules.ao_scraper.enrichissement import a_enrichir, fusionner_enrichissement  # noqa: E402


def test_fusion_n_ecrase_jamais_l_existant():
    ancienne = {"contexte": {"objet": "corrige par l'utilisateur"}, "profils_requis": [{"poste": "CP"}],
                "_analyse_meta": {"partielle": False}}
    nouvelle = {"contexte": {"objet": "version du modele"}, "profils_requis": [],
                "risques": [{"type": "delai"}], "jalons": [], "_analyse_meta": {"partielle": True}}
    fusion = fusionner_enrichissement(ancienne, nouvelle)
    assert fusion["contexte"] == {"objet": "corrige par l'utilisateur"}
    assert fusion["profils_requis"] == [{"poste": "CP"}]
    assert fusion["risques"] == [{"type": "delai"}]
    assert fusion["jalons"] == []
    assert fusion["_analyse_meta"] == {"partielle": False, "enrichissement": {"partielle": True}}
    assert "risques" not in ancienne  # l'original n'est pas modifie


def test_fusion_ne_remplace_pas_des_risques_deja_la():
    fusion = fusionner_enrichissement({"risques": [{"type": "a"}]}, {"risques": [{"type": "b"}]})
    assert fusion["risques"] == [{"type": "a"}]


def test_a_enrichir():
    assert a_enrichir({"contexte": {}}) is True
    assert a_enrichir({"contexte": {}, "risques": []}) is False
    assert a_enrichir(None) is False
    assert a_enrichir({}) is False
