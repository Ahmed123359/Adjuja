"""Lecture des résultats publiés (app/modules/award_scraper/parsing.py).

La carte BDC est celle relevée sur le portail le 2026-10-01.
"""

from datetime import datetime
from decimal import Decimal

from app.modules.award_scraper.parsing import (
    CASABLANCA,
    cle_bdc,
    liens_pieces_jointes,
    lire_cartes_bdc,
    lire_montant,
    normaliser_nom,
)

CARTE = """
<div class="entreprise__card">
 <div class="entreprise__leftSubCard"><span>BDC</span></div>
 <div class="entreprise__middleSubCard">
  <div class="font-bold table__links">Référence : BCN18/2026</div>
  <div class="truncate_fullWidth table__links" data-bs-title="Réalisation des essais de contrôle de la qualité">
   <span class="font-bold">Objet :</span> Réalisation des essais de contrôle de la qualité</div>
  <div class="table__links"><span>Acheteur :</span> DELEGUE DU MINISTERE DES AFFAIRES CULTURELLES ERRACHIDIA</div>
  <div class="table__links"><span>Date de publication du résultat :</span> 01/10/2026 13:11</div>
 </div>
 <div class="entreprise__rightSubCard"><div>
  <span>Nombre de devis reçus : <span>6</span></span>
  <span>Entreprise attributaire  : <span>LABO-EST</span></span>
  <span>Montant TTC : <span>15 600,00 MAD</span></span>
 </div></div>
</div>
<div class="entreprise__card">
 <div class="entreprise__middleSubCard">
  <div>Référence : 07/2026</div>
  <div data-bs-title="Achat de fournitures">Objet : Achat de fournitures</div>
  <div>Acheteur : COMMUNE X</div>
  <div>Date de publication du résultat : 30/09/2026 09:05</div>
 </div>
 <div class="entreprise__rightSubCard"><div><span>Avis d'achat infructueux</span></div></div>
</div>
"""


def test_carte_bdc_attribuee() -> None:
    r = lire_cartes_bdc(CARTE, "u")[0]
    assert (r.reference, r.attributaire, r.montant_ttc, r.nb_offres) == ("BCN18/2026", "LABO-EST", Decimal("15600.00"), 6)
    assert r.acheteur == "DELEGUE DU MINISTERE DES AFFAIRES CULTURELLES ERRACHIDIA"
    assert r.date_publication == datetime(2026, 10, 1, 13, 11, tzinfo=CASABLANCA)
    assert r.objet == "Réalisation des essais de contrôle de la qualité" and not r.est_infructueux


def test_carte_bdc_infructueuse_sans_attributaire() -> None:
    r = lire_cartes_bdc(CARTE, "u")[1]
    assert r.est_infructueux and r.attributaire is None and r.montant_ttc is None


def test_cle_bdc_distingue_les_acheteurs() -> None:
    d = datetime(2026, 9, 30, 9, 5)
    assert cle_bdc("07/2026", "COMMUNE X", d) != cle_bdc("07/2026", "COMMUNE Y", d)
    assert cle_bdc("07/2026", "commune x", d) == cle_bdc("07/2026", "COMMUNE X", d)


def test_normaliser_nom() -> None:
    assert normaliser_nom("Bé Data S.A.R.L") == normaliser_nom("BE DATA SARL") == "BE DATA"
    assert normaliser_nom("Sté LABO-EST sarl au") == "LABO EST"


def test_lire_montant() -> None:
    assert lire_montant("1 250 000,50 MAD") == Decimal("1250000.50")
    assert lire_montant("314304.00") == Decimal("314304.00")
    assert lire_montant("") is None


def test_liens_pieces_jointes_id_non_vide() -> None:
    html = """<a href="index.php?page=entreprise.EntrepriseDownloadAvisJAL&refConsultation=1&orgAcronyme=a&idAvis=">vide</a>
              <a href="index.php?page=entreprise.EntrepriseDownloadAvisJAL&refConsultation=1&orgAcronyme=a&idAvis=532542">PV</a>
              <a href="index.php?page=entreprise.EntrepriseDownloadAvisJAL&refConsultation=1&orgAcronyme=a&idAvis=532542">doublon</a>"""
    liens = liens_pieces_jointes(html, "https://www.marchespublics.gov.ma")
    assert [l["id_avis"] for l in liens] == ["532542"]
    assert liens[0]["url"].startswith("https://www.marchespublics.gov.ma/index.php?page=entreprise.EntrepriseDownloadAvisJAL")
