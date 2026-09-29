"""Gabarit de l'email de veille (premiers tests du service de notification)."""

from datetime import date, timedelta
from decimal import Decimal

from app.templates.ao_digest import AoDigestTemplate, AoItem, _acheteur, _echeance, _montant, _ville


def _ao(**champs) -> AoItem:
    base = dict(titre="Travaux de voirie", acheteur="Commune X", categorie="Travaux",
                date_limite=date.today() + timedelta(days=10), url_source="https://portail/avis?id=1",
                reference="1043326", mode_passation="Appel d'offres ouvert", ville="EL KELAA...EL KELAA",
                budget_estime=Decimal("1779718.56"), caution=Decimal("35000.00"))
    base.update(champs)
    return AoItem(**base)


def test_montant_exact_format_francais():
    assert _montant(Decimal("1779718.56"))[0] == "1&#8239;779&#8239;718,56&nbsp;DH"
    assert _montant(Decimal("35000.00"))[0] == "35&#8239;000&nbsp;DH"
    assert _montant(None)[0] == "Non publiée"


def test_ville_dedoublonnee():
    assert _ville("EL KELAA DES SRAGHNA...EL KELAA DES SRAGHNA") == "EL KELAA DES SRAGHNA"
    assert _ville("MARRAKECH...SAADA") == "MARRAKECH · SAADA"
    assert _ville("RABAT") == "RABAT"
    assert _ville(None) is None
    assert _ville("...") is None


def test_echeance_relative_et_urgence():
    aujourdhui = date.today()
    assert _echeance(aujourdhui)[0].startswith("Dernier jour")
    assert _echeance(aujourdhui + timedelta(days=3))[0].startswith("J-3 ·")
    rouge = _echeance(aujourdhui + timedelta(days=2))[1]
    orange = _echeance(aujourdhui + timedelta(days=6))[1]
    neutre = _echeance(aujourdhui + timedelta(days=20))[1]
    assert len({rouge, orange, neutre}) == 3
    assert _echeance(aujourdhui - timedelta(days=1))[0].startswith("Clôturé")
    assert _echeance(None)[0] == "Date limite non publiée"


def test_rendu_complet():
    contenu = AoDigestTemplate().render({"aos": [_ao(), _ao(budget_estime=None, caution=None, mode_passation=None)]})
    assert contenu.subject == "Adjuja : 2 nouveaux appels d'offres pour vous"
    html = contenu.html
    assert "1&#8239;779&#8239;718,56&nbsp;DH" in html
    assert "Non publiée" in html          # AO sans estimation ni caution
    assert "EL KELAA...EL KELAA" not in html
    assert "linear-gradient" not in html  # Outlook n'affiche pas les degrades
    assert "font-size:11" not in html and "font-size:12" not in html and "font-size:13" not in html
    assert "Estimation : 1 779 718,56 DH" in contenu.text


def test_contenu_du_portail_echappe():
    contenu = AoDigestTemplate().render({"aos": [_ao(titre="<script>x</script> & co", acheteur="A <b>B</b>")]})
    assert "<script>" not in contenu.html
    assert "&lt;script&gt;" in contenu.html
    assert "&amp; co" in contenu.html


def test_prefixe_acheteur_retire():
    assert _acheteur("Acheteur :CDG CAPITAL") == "CDG CAPITAL"
    assert _acheteur("ONEE") == "ONEE"
    assert _acheteur("Acheteur : ") is None
