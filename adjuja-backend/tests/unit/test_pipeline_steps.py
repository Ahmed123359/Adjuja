"""Tests de la logique partagée entre les modes express et accompagné.

`applicable_steps` est le point où les deux modes peuvent silencieusement
diverger : c'est elle qui décide à la fois du contenu du chord Celery (express)
et de l'applicabilité des étapes (accompagné). Elle est pure, donc testable sans
base ni broker, ce qui est exactement pourquoi elle a été extraite.
"""
from app.services.pipeline_steps_service import (
    CONDITIONAL_STEPS,
    STEP_KEYS,
    STEP_ORDER,
    STEP_TASK,
    TASK_NAME_TO_STEP,
    applicable_steps,
)


class TestApplicableSteps:

    def test_analyse_vide_pas_de_redaction_ni_remplissage(self):
        flags = applicable_steps({})
        assert flags["redaction"] is False
        assert flags["remplissage"] is False

    def test_analyse_none_ne_leve_pas(self):
        # Un AO peut être lancé avant que l'analyse existe (applicable=None).
        assert applicable_steps(None)["redaction"] is False

    def test_document_a_generer_active_la_redaction_seule(self):
        flags = applicable_steps({"documents_requis": [{"source": "generer"}]})
        assert flags["redaction"] is True
        assert flags["remplissage"] is False

    def test_document_a_remplir_active_le_remplissage_seul(self):
        flags = applicable_steps({"documents_requis": [{"source": "remplir"}]})
        assert flags["redaction"] is False
        assert flags["remplissage"] is True

    def test_les_deux_sources_activent_les_deux_etapes(self):
        flags = applicable_steps({
            "documents_requis": [{"source": "generer"}, {"source": "remplir"}],
        })
        assert flags["redaction"] is True
        assert flags["remplissage"] is True

    def test_source_inconnue_n_active_rien(self):
        flags = applicable_steps({"documents_requis": [{"source": "fournir"}]})
        assert flags["redaction"] is False
        assert flags["remplissage"] is False

    def test_documents_requis_null_traite_comme_vide(self):
        # Le LLM renvoie parfois null plutôt qu'une liste vide.
        assert applicable_steps({"documents_requis": None})["redaction"] is False

    def test_les_cinq_autres_etapes_sont_toujours_applicables(self):
        flags = applicable_steps({})
        for key in STEP_KEYS:
            if key not in CONDITIONAL_STEPS:
                assert flags[key] is True, key

    def test_toutes_les_etapes_sont_couvertes(self):
        assert set(applicable_steps({})) == set(STEP_KEYS)


class TestStepDefinitions:

    def test_sept_etapes_dans_l_ordre(self):
        assert len(STEP_KEYS) == 7
        assert [STEP_ORDER[k] for k in STEP_KEYS] == [1, 2, 3, 4, 5, 6, 7]

    def test_seule_la_decision_n_a_pas_de_tache(self):
        sans_tache = [k for k in STEP_KEYS if STEP_TASK[k] is None]
        assert sans_tache == ["decision"]

    def test_chaque_tache_pointe_une_etape_unique(self):
        # Le handler d'échec Celery ne reçoit que le nom de la tâche : une tâche
        # qui porterait deux étapes rendrait le marquage d'erreur ambigu.
        assert len(TASK_NAME_TO_STEP) == 6
        assert len(set(TASK_NAME_TO_STEP.values())) == 6

    def test_les_taches_existent_reellement_dans_ao_tasks(self):
        from app.tasks import ao_tasks

        for key in STEP_KEYS:
            task_name = STEP_TASK[key]
            if task_name:
                assert hasattr(ao_tasks, task_name), f"{key} -> {task_name}"
