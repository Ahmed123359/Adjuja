"""Classement prévu d'un appel d'offres, selon le décret n° 2-22-431.

Fonction pure : ni base, ni réseau. Elle reçoit les offres connues (lues en
séance publique ou extraites d'un PV) et rend le classement que la commission
devrait établir. Spec : context/feature-spec/suivi-resultats/00-overview.md.

Règles appliquées (BO n° 7184 du 6-4-2023) :

- Art. 43-II, offre économiquement la plus avantageuse :
  a) travaux et services autres que les études : la mieux-disante par rapport
     au prix de référence ; gardiennage, nettoyage des bâtiments administratifs
     et entretien des espaces verts : le taux de majoration le plus faible
     appliqué à l'estimation ;
  b) fournitures : la mieux-disante par rapport au prix de référence ;
  c) études : la meilleure note technico-financière (art. 144).
- Art. 44 : écarter les offres excessives (plus de 20 % au-dessus de
  l'estimation) et anormalement basses (plus de 20 % en dessous pour les
  travaux, plus de 25 % pour les fournitures et les services) ; prix de
  référence P = (E + moyenne des offres restantes) / 2 ; la mieux-disante est
  la plus proche de P par défaut, à défaut la plus proche par excès.
- Art. 144-B (études) : seuil technique du règlement de consultation, mêmes
  seuils excessif / anormalement bas (20 % / 25 %), note financière 100 à la
  moins-disante et inversement proportionnelle pour les autres, note globale
  pondérée, poids financier entre 10 et 40 points.

Limites assumées, dites à l'écran par des avertissements : une offre
anormalement basse n'est écartée par la commission qu'après justification
refusée ; le règlement de consultation peut fixer une autre méthode de note
financière (art. 144) ; la préférence nationale (art. 147) et la réserve
de l'art. 20 §3 a) (gardiennage) ne sont pas appliquées.
"""

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

NATURES = ("travaux", "fournitures", "services", "etudes", "gardiennage_nettoyage")
STATUTS_ECARTES = {"ecarte_administratif", "ecarte_technique"}

SEUIL_EXCESSIF = Decimal("0.20")
SEUIL_BAS_TRAVAUX = Decimal("0.20")
SEUIL_BAS_AUTRES = Decimal("0.25")
POIDS_FINANCIER_MIN, POIDS_FINANCIER_MAX = Decimal("10"), Decimal("40")

DEUX = Decimal("0.01")


def _arrondi(v: Decimal) -> Decimal:
    return v.quantize(DEUX, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class Offre:
    id: str
    nom: str
    montant: Decimal | None          # montant corrigé s'il existe, sinon lu
    statut: str = "en_attente"       # en_attente | admis | ecarte_administratif | ecarte_technique
    est_nous: bool = False
    note_technique: Decimal | None = None


@dataclass
class OffreEvaluee:
    id: str
    nom: str
    est_nous: bool
    montant: Decimal | None
    # retenue | excessive | anormalement_basse | ecarte_administratif |
    # ecarte_technique | sous_seuil_technique | sans_montant
    issue: str
    rang: int | None = None
    ecart_reference_pct: Decimal | None = None   # (montant - P) / P, en %
    taux_majoration_pct: Decimal | None = None   # gardiennage : (montant - E) / E
    note_financiere: Decimal | None = None
    note_globale: Decimal | None = None
    gagnante: bool = False


@dataclass
class Classement:
    nature: str
    calculable: bool
    # estimation_manquante | aucune_offre | aucune_offre_retenue |
    # ponderation_manquante | ponderation_hors_bornes | notes_techniques_manquantes
    raison: str | None = None
    prix_reference: Decimal | None = None
    offres: list[OffreEvaluee] = field(default_factory=list)
    gagnante_id: str | None = None
    # statuts_supposes_admis | anormalement_basse_sous_reserve | ex_aequo |
    # methode_note_financiere_rc | reserve_art20_non_verifiee
    avertissements: list[str] = field(default_factory=list)


def _evaluees(offres: list[Offre]) -> list[OffreEvaluee]:
    return [OffreEvaluee(id=o.id, nom=o.nom, est_nous=o.est_nous, montant=o.montant, issue="retenue")
            for o in offres]


def _ecarter_par_statut(offres: list[Offre], evals: dict[str, OffreEvaluee]) -> list[Offre]:
    """Écartés par la commission (dossier administratif ou technique), et
    offres sans montant connu : hors calcul."""
    restantes = []
    for o in offres:
        if o.statut in STATUTS_ECARTES:
            evals[o.id].issue = o.statut
        elif o.montant is None:
            evals[o.id].issue = "sans_montant"
        else:
            restantes.append(o)
    return restantes


def _ecarter_par_estimation(
    offres: list[Offre], evals: dict[str, OffreEvaluee], estimation: Decimal, seuil_bas: Decimal,
) -> list[Offre]:
    plafond = estimation * (1 + SEUIL_EXCESSIF)
    plancher = estimation * (1 - seuil_bas)
    restantes = []
    for o in offres:
        assert o.montant is not None
        if o.montant > plafond:
            evals[o.id].issue = "excessive"
        elif o.montant < plancher:
            evals[o.id].issue = "anormalement_basse"
        else:
            restantes.append(o)
    return restantes


def _rangs(ordre: list[Offre], evals: dict[str, OffreEvaluee], cle) -> None:
    """Rang 1 à la meilleure ; deux offres égales sur la clé ont le même rang."""
    precedente, rang = None, 0
    for i, o in enumerate(ordre, start=1):
        valeur = cle(o)
        if valeur != precedente:
            rang, precedente = i, valeur
        evals[o.id].rang = rang


def classer(
    nature: str,
    estimation: Decimal | None,
    offres: list[Offre],
    poids_financier: Decimal | None = None,
    seuil_technique: Decimal | None = None,
) -> Classement:
    if nature not in NATURES:
        raise ValueError(f"Nature de marché inconnue : {nature}")
    res = Classement(nature=nature, calculable=False)
    evals = {e.id: e for e in _evaluees(offres)}
    res.offres = list(evals.values())

    if not offres:
        res.raison = "aucune_offre"
        return res
    if estimation is None or estimation <= 0:
        res.raison = "estimation_manquante"
        return res
    if any(o.statut == "en_attente" for o in offres):
        res.avertissements.append("statuts_supposes_admis")

    restantes = _ecarter_par_statut(offres, evals)

    if nature == "etudes":
        if poids_financier is None:
            res.raison = "ponderation_manquante"
            return res
        if not POIDS_FINANCIER_MIN <= poids_financier <= POIDS_FINANCIER_MAX:
            res.raison = "ponderation_hors_bornes"
            return res
        if seuil_technique is not None:
            garder = []
            for o in restantes:
                if o.note_technique is not None and o.note_technique < seuil_technique:
                    evals[o.id].issue = "sous_seuil_technique"
                else:
                    garder.append(o)
            restantes = garder
        if any(o.note_technique is None for o in restantes):
            res.raison = "notes_techniques_manquantes"
            return res

    seuil_bas = SEUIL_BAS_TRAVAUX if nature == "travaux" else SEUIL_BAS_AUTRES
    restantes = _ecarter_par_estimation(restantes, evals, estimation, seuil_bas)
    if any(e.issue == "anormalement_basse" for e in evals.values()):
        res.avertissements.append("anormalement_basse_sous_reserve")
    if not restantes:
        res.raison = "aucune_offre_retenue"
        return res

    res.calculable = True
    if nature == "etudes":
        _classer_etudes(res, restantes, evals, poids_financier)  # type: ignore[arg-type]
    elif nature == "gardiennage_nettoyage":
        _classer_taux_majoration(res, restantes, evals, estimation)
    else:
        _classer_prix_reference(res, restantes, evals, estimation)

    gagnantes = [e for e in evals.values() if e.rang == 1]
    if len(gagnantes) > 1:
        res.avertissements.append("ex_aequo")
    if gagnantes:
        gagnantes[0].gagnante = True
        res.gagnante_id = gagnantes[0].id
    return res


def _classer_prix_reference(
    res: Classement, restantes: list[Offre], evals: dict[str, OffreEvaluee], estimation: Decimal,
) -> None:
    moyenne = sum((o.montant for o in restantes), Decimal(0)) / len(restantes)  # type: ignore[misc]
    p = _arrondi((estimation + moyenne) / 2)
    res.prix_reference = p
    # La plus proche par défaut d'abord ; les offres au-dessus de P ne passent
    # qu'après toutes celles en dessous (art. 44 : « à défaut »).
    dessous = sorted((o for o in restantes if o.montant <= p), key=lambda o: p - o.montant)  # type: ignore[operator]
    dessus = sorted((o for o in restantes if o.montant > p), key=lambda o: o.montant - p)    # type: ignore[operator]
    ordre = dessous + dessus
    _rangs(ordre, evals, cle=lambda o: (o.montant <= p, abs(o.montant - p)))                 # type: ignore[operator]
    for o in restantes:
        evals[o.id].ecart_reference_pct = _arrondi((o.montant - p) / p * 100)                # type: ignore[operator]


def _classer_taux_majoration(
    res: Classement, restantes: list[Offre], evals: dict[str, OffreEvaluee], estimation: Decimal,
) -> None:
    ordre = sorted(restantes, key=lambda o: o.montant)  # type: ignore[arg-type,return-value]
    _rangs(ordre, evals, cle=lambda o: o.montant)
    for o in restantes:
        evals[o.id].taux_majoration_pct = _arrondi((o.montant - estimation) / estimation * 100)  # type: ignore[operator]
    res.avertissements.append("reserve_art20_non_verifiee")


def _classer_etudes(
    res: Classement, restantes: list[Offre], evals: dict[str, OffreEvaluee], poids_financier: Decimal,
) -> None:
    moins_disant = min(o.montant for o in restantes)  # type: ignore[type-var]
    poids_technique = Decimal(100) - poids_financier
    for o in restantes:
        nf = _arrondi(Decimal(100) * moins_disant / o.montant)  # type: ignore[operator]
        ng = _arrondi(o.note_technique * poids_technique / 100 + nf * poids_financier / 100)  # type: ignore[operator]
        evals[o.id].note_financiere = nf
        evals[o.id].note_globale = ng
    ordre = sorted(restantes, key=lambda o: evals[o.id].note_globale, reverse=True)  # type: ignore[arg-type,return-value]
    _rangs(ordre, evals, cle=lambda o: evals[o.id].note_globale)
    res.avertissements.append("methode_note_financiere_rc")
