# -*- coding: utf-8 -*-
"""
Nomenclature officielle "Mode de passation" du formulaire de recherche avancee de
marchespublics.gov.ma (dropdown ctl0_CONTENU_PAGE_AdvancedSearch_procedureType).
Reference statique, extraite directement du HTML reel le 2026-08-21 (pas saisie a la
main). Libelles copies tels quels, y compris l'incoherence apostrophe droite/courbe
deja presente dans la source -- le champ mode_passation scrape sur un AO contient le
libelle EXACT affiche par le portail, donc le filtre doit matcher la valeur litterale
stockee, comme pour app.core.nature_prestation.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ModePassation:
    code: str
    label: str


MODES_PASSATION: tuple[ModePassation, ...] = (
    ModePassation("37", "Appel à manifestation d'intérêt"),
    ModePassation("34", "Appel d'offres avec préselection - Phase 1"),
    ModePassation("35", "Appel d'offres avec préselection - Phase 2"),
    ModePassation("1", "Appel d'offres ouvert"),
    ModePassation("50", "Appel d'offres ouvert simplifié"),
    ModePassation("2", "Appel d'offres restreint"),
    ModePassation("58", "Appel d’offres avec préqualification – Partenariat Public-Privé – Phase 1"),
    ModePassation("59", "Appel d’offres avec préqualification – Partenariat Public-Privé – Phase 2"),
    ModePassation("56", "Appel d’offres avec présélection – Partenariat Public-Privé – Phase 1"),
    ModePassation("57", "Appel d’offres avec présélection – Partenariat Public-Privé – Phase 2"),
    ModePassation("47", "Concours - Phase 2"),
    ModePassation("40", "Concours Architectural"),
    ModePassation("4", "Concours Phase 1"),
    ModePassation("44", "Consultation architecturale négociée avec publicité préalable - Phase 1"),
    ModePassation("45", "Consultation architecturale négociée avec publicité préalable - Phase 2"),
    ModePassation("46", "Consultation architecturale négociée sans publicité préalable"),
    ModePassation("39", "Consultation architecturale ouverte"),
    ModePassation("52", "Consultation architecturale ouverte simplifiée"),
    ModePassation("51", "Consultation architecturale restreinte"),
    ModePassation("60", "Demande de Cotation Ouverte - Banques Multilatérales de Développement"),
    ModePassation("61", "Demande de Cotation Restreinte - Banques Multilatérales de Développement"),
    ModePassation("53", "Dialogue compétitif - Phase 1"),
    ModePassation("54", "Dialogue compétitif - Phase 2"),
    ModePassation("55", "Dialogue compétitif - Phase 3"),
    ModePassation("38", "Enchère électronique inversée"),
    ModePassation("42", "Marché négocié avec publicité préalable - Phase 1"),
    ModePassation("43", "Marché négocié avec publicité préalable - Phase 2"),
    ModePassation("9", "Marché négocié sans publicité préalable"),
)
