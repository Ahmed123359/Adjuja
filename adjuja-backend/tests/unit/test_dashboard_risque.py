"""Tests du calcul de risque d'échéance du tableau de bord.

Voir `context/feature-spec/dashboard-risque-validations/00-overview.md`.

`progression`, `_marge` et `_niveau` sont pures : elles ne lisent que des
attributs, donc elles se testent sans base ni broker. C'est aussi ce qui les
rend vérifiables -- le risque affiché à l'utilisateur est une mesure, et une
mesure doit pouvoir être reproduite à la main.

Les objets AO et étape sont des `SimpleNamespace` : dépendre du modèle
SQLAlchemy ferait de ces tests des tests de schéma, alors qu'ils portent sur une
formule.
"""
from datetime import date
from types import SimpleNamespace

from app.services.dashboard_service import (
    MARGE_CRITIQUE,
    MARGE_TENDUE,
    _marge,
    _niveau,
    progression,
)


def ao(mode="express", pipeline_pct=0):
    return SimpleNamespace(mode=mode, pipeline_pct=pipeline_pct)


def etape(statut="a_faire", applicable=True, step_order=1, step_key="documents"):
    return SimpleNamespace(
        statut=statut, applicable=applicable,
        step_order=step_order, step_key=step_key,
    )


class TestProgression:
    """Le point où les deux modes divergent silencieusement si on ne fait rien."""

    def test_express_suit_pipeline_pct(self):
        assert progression(ao("express", 40), []) == 0.4

    def test_express_borne_les_valeurs_hors_echelle(self):
        # pipeline_pct est un entier libre en base : rien ne garantit 0..100.
        assert progression(ao("express", 140), []) == 1.0
        assert progression(ao("express", -10), []) == 0.0

    def test_accompagne_compte_les_etapes_et_non_pipeline_pct(self):
        # Le cas que toute la fonctionnalité cherche à détecter : les tâches de
        # fond ont tourné (pipeline_pct élevé) mais une seule étape sur quatre
        # est acquise, parce que le dossier attend une validation humaine.
        etapes = [
            etape("validee", step_order=1),
            etape("attente_validation", step_order=2),
            etape("a_faire", step_order=3),
            etape("a_faire", step_order=4),
        ]
        assert progression(ao("accompagne", 90), etapes) == 0.25

    def test_accompagne_les_non_applicables_sortent_du_denominateur(self):
        # non_applicable est acquis ET compté : l'étape n'a pas à être faite.
        etapes = [
            etape("validee", step_order=1),
            etape("non_applicable", applicable=False, step_order=2),
            etape("a_faire", step_order=3),
        ]
        # applicable=False est retiré du total : 1 acquise sur 2 retenues.
        assert progression(ao("accompagne", 0), etapes) == 0.5

    def test_accompagne_applicable_inconnu_compte_dans_le_total(self):
        # applicable=None (redaction/remplissage avant l'analyse) : tant qu'on ne
        # sait pas, on ne retire pas de travail du total.
        etapes = [etape("validee"), etape("a_faire", applicable=None)]
        assert progression(ao("accompagne", 0), etapes) == 0.5

    def test_accompagne_sans_etapes_retombe_sur_pipeline_pct(self):
        # Les lignes d'étapes ne sont pas encore créées : le seul signal reste
        # pipeline_pct. Renvoyer 0 ferait passer tout AO neuf pour en danger.
        assert progression(ao("accompagne", 60), []) == 0.6


class TestMarge:
    """marge = avance acquise - temps consommé. Négatif = en retard sur le rythme."""

    def test_a_mi_parcours_et_a_moitie_fait_marge_nulle(self):
        # Fenêtre de 10 jours, 5 écoulés, 50 % fait : pile dans les temps.
        marge = _marge("2026-09-20", "2026-09-30", 0.5, date(2026, 9, 25))
        assert marge == 0.0

    def test_temps_consomme_sans_travail_fait_marge_franchement_negative(self):
        marge = _marge("2026-09-15", "2026-09-30", 0.2, date(2026, 9, 27))
        # 12 jours sur 15 consommés (0,8) pour 0,2 de travail.
        assert marge == -0.6
        assert marge <= MARGE_CRITIQUE

    def test_travail_en_avance_marge_positive(self):
        marge = _marge("2026-09-20", "2026-09-30", 0.9, date(2026, 9, 22))
        assert marge > 0

    def test_fenetre_nulle_ou_inversee_vaut_temps_maximal(self):
        # L'import de la veille peut créer un AO après sa propre date limite.
        # Il n'y a alors jamais eu de marge : on ne divise pas par zéro et on ne
        # renvoie pas un dossier sain.
        assert _marge("2026-10-01", "2026-09-30", 0.0, date(2026, 9, 25)) == -1.0
        assert _marge("2026-09-30", "2026-09-30", 0.4, date(2026, 9, 30)) == -0.6

    def test_date_de_creation_illisible_ne_leve_pas(self):
        # created_at est une chaîne libre en base : une valeur cassée ne doit pas
        # faire tomber tout le tableau de bord.
        assert _marge("", "2026-09-30", 0.5, date(2026, 9, 25)) == 0.0


class TestNiveau:

    def test_echeance_depassee_est_en_retard_quel_que_soit_le_reste(self):
        assert _niveau(-1, 0.99, 0.5) == "en_retard"

    def test_deux_jours_et_dossier_incomplet_est_critique(self):
        assert _niveau(2, 0.2, 0.0) == "critique"

    def test_deux_jours_mais_presque_fini_n_est_pas_signale(self):
        # Le cas qui justifie le seuil PRESQUE_FINI : rendre dans deux jours un
        # dossier terminé à 95 % n'est pas un risque.
        assert _niveau(2, 0.95, 0.0) is None

    def test_marge_tres_negative_est_critique_meme_loin_de_l_echeance(self):
        # 40 jours restants, mais le dossier n'a pas avancé du tout : le seuil
        # de marge rattrape ce que le seuil de jours laisserait passer.
        assert _niveau(40, 0.0, MARGE_CRITIQUE) == "critique"

    def test_sept_jours_et_dossier_incomplet_est_tendu(self):
        assert _niveau(7, 0.5, 0.0) == "tendu"

    def test_marge_moderement_negative_est_tendue(self):
        assert _niveau(40, 0.1, MARGE_TENDUE) == "tendu"

    def test_dossier_sain_n_est_pas_renvoye(self):
        # None veut dire « rien à signaler » : un AO qui va bien n'a pas sa place
        # dans une liste de ce qui va mal.
        assert _niveau(30, 0.6, 0.1) is None

    def test_dossier_termine_a_temps_n_est_pas_signale(self):
        assert _niveau(5, 1.0, 0.3) is None
