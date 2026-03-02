import pytest
from app.services.ao_parser_service import AOParserService
from app.models.appel_offre import TypeMarche


@pytest.fixture
def parser():
    return AOParserService()


@pytest.fixture
def ao_texte_exemple():
    return """
# Marché de prestation de services informatiques

Référence : AO-2024-IT-042
Acheteur : Communauté de Communes du Pays de Loire

## Objet du marché
Prestations de développement logiciel et de conseil en transformation digitale.
Budget : 150 000 € HT

## Critères de sélection
- Prix : 40%
- Valeur technique : 40%
- Délai de mise en œuvre : 20%

## Description des besoins
Développement d'une plateforme web de gestion documentaire.

## Livrables attendus
- Application web responsive
- Documentation technique
- Formation des utilisateurs
"""


class TestAOParserService:

    def test_parse_retourne_appel_offre(self, parser, ao_texte_exemple):
        ao = parser.parse(ao_texte_exemple)
        assert ao is not None
        assert ao.titre != ""

    def test_detection_type_services(self, parser, ao_texte_exemple):
        ao = parser.parse(ao_texte_exemple)
        assert ao.type_marche == TypeMarche.SERVICES

    def test_extraction_reference(self, parser, ao_texte_exemple):
        ao = parser.parse(ao_texte_exemple)
        assert ao.reference == "AO-2024-IT-042"

    def test_extraction_budget(self, parser, ao_texte_exemple):
        ao = parser.parse(ao_texte_exemple)
        assert ao.budget_estime == 150000.0

    def test_extraction_criteres(self, parser, ao_texte_exemple):
        ao = parser.parse(ao_texte_exemple)
        assert len(ao.criteres) == 3
        noms = [c.nom.strip().lower() for c in ao.criteres]
        assert any("prix" in n for n in noms)

    def test_extraction_sections(self, parser, ao_texte_exemple):
        ao = parser.parse(ao_texte_exemple)
        assert len(ao.sections) >= 3

    def test_texte_brut_conserve(self, parser, ao_texte_exemple):
        ao = parser.parse(ao_texte_exemple)
        assert ao.texte_brut == ao_texte_exemple
