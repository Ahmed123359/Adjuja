"""Email de veille : les nouveaux appels d'offres des secteurs suivis.

Univers du site (retour utilisateur du 2026-09-29 : « quelque chose
d'Adjuja, la Terre 3D, l'astro ») :
- fond spatial bleu nuit, comme le heros du site ;
- bandeau : la Terre rendue en 3D a partir de la texture du site, centree sur
  le Maroc, avec un signal turquoise sur Rabat et la lune
  (image precalculee : outils/rendre_images_email.py -> public/email/) ;
- chaque AO dans un panneau sombre : compte a rebours de l'echeance, objet en
  grand, chiffres cles ;
- pied : la lune et la phrase du pied de page du site.

Contraintes email tenues : pas de 3D ni d'animation, pas de degrade CSS
(Outlook les ignore), couleurs pleines + bgcolor, textes en HTML (lisibles
meme images bloquees), texte >= 14 px, contenu du portail echappe.
"""

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from html import escape

from sqlalchemy.engine import Row

from app.channels.base import NotificationContent
from app.templates.base import NotificationTemplate

SITE = "https://adjuja.com"
APP_URL = f"{SITE}/app"
LOGO_URL = f"{SITE}/logo-adjuja-mark.png"
TERRE_URL = f"{SITE}/email/terre.jpg"
LUNE_URL = f"{SITE}/email/lune.png"

# Palette du site public (theme sombre), en couleurs pleines.
ESPACE = "#050818"      # fond de l'email
NUIT = "#0A1030"        # panneau principal
PANNEAU = "#0F1838"     # carte d'un AO
FILET = "#1F2B55"
BLANC = "#FFFFFF"
TEXTE = "#C6D0E3"       # texte secondaire, couleur pleine lisible
DISCRET = "#8392BA"
BLEU = "#2B79E8"
BLEU_DOUX = "#8FBBFF"
TURQUOISE = "#1BC9A8"
ROUGE, ROUGE_FOND = "#FF8A84", "#3A1622"
AMBRE, AMBRE_FOND = "#F4BE5A", "#3A2A12"
NEUTRE, NEUTRE_FOND = "#C6D0E3", "#16214A"


@dataclass
class AoItem:
    titre: str
    acheteur: str | None
    categorie: str | None
    date_limite: date | None
    url_source: str
    reference: str | None = None
    mode_passation: str | None = None
    ville: str | None = None
    budget_estime: Decimal | None = None
    caution: Decimal | None = None
    ao_id: int | None = None      # id de watcher.scraped_aos : lien vers la fiche dans Adjuja
    portee_analyse: str | None = None  # « nationale » / « internationale » lu dans le RC par l'analyse

    @classmethod
    def depuis_ligne(cls, ligne: Row) -> "AoItem":
        """Ligne SQL de watcher.scraped_aos (id, titre, ..., caution, reference,
        portee) -> AoItem. Un seul endroit pour les trois envois (lot,
        newsletter, test). La reference affichee est celle de l'avis ;
        external_id (identifiant interne du portail) ne parle a personne."""
        return cls(
            titre=ligne.titre, acheteur=ligne.acheteur, categorie=ligne.categorie,
            date_limite=ligne.date_limite, url_source=ligne.url_source,
            reference=ligne.reference, mode_passation=ligne.mode_passation,
            ville=ligne.ville, budget_estime=ligne.budget_estime, caution=ligne.caution,
            ao_id=ligne.id, portee_analyse=ligne.portee,
        )

    @property
    def lien(self) -> str:
        """La fiche de l'AO dans Adjuja (retour utilisateur du 2026-09-30 : le
        lien doit mener a Adjuja, pas au portail). Le portail seulement si l'id
        manque."""
        return f"{APP_URL}/veille/ao/{self.ao_id}" if self.ao_id else self.url_source


_HTML = """\
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>{subject}</title>
</head>
<body style="margin:0;padding:0;background:{espace};font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;">
    {preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="{espace}" style="background:{espace};">
    <tr>
      <td align="center" style="padding:20px 10px 32px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="{nuit}"
               style="width:100%;max-width:600px;background:{nuit};border:1px solid {filet};border-radius:16px;">

          <!-- Marque -->
          <tr>
            <td style="padding:20px 24px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                      <td style="padding-right:10px;vertical-align:middle;">
                        <img src="{logo_url}" width="34" height="34" alt="" style="display:block;border-radius:8px;">
                      </td>
                      <td style="vertical-align:middle;font-size:21px;font-weight:800;color:{blanc};">Adjuja</td>
                    </tr></table>
                  </td>
                  <td align="right" style="vertical-align:middle;font-size:14px;color:{discret};">Veille du {date_du_jour}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- La Terre vue de l'espace, signal sur le Maroc -->
          <tr>
            <td bgcolor="{espace}" style="background:{espace};padding:0;">
              <img src="{terre_url}" width="600" alt="La Terre vue de l'espace, un signal sur le Maroc"
                   style="display:block;width:100%;max-width:600px;height:auto;border:0;">
            </td>
          </tr>

          <!-- Titre -->
          <tr>
            <td style="padding:24px 24px 6px;">
              <p style="margin:0;font-size:14px;font-weight:700;color:{turquoise};">&#9679;&nbsp; Signal reçu de vos secteurs</p>
              <p style="margin:8px 0 0;font-size:26px;line-height:1.25;font-weight:800;color:{blanc};">{titre_email}</p>
              <p style="margin:8px 0 0;font-size:15px;line-height:1.55;color:{texte};">{sous_titre}</p>
            </td>
          </tr>

          <!-- Avis -->
          <tr>
            <td style="padding:16px 24px 4px;">
              {ao_cards}
            </td>
          </tr>

          <!-- Appel a l'action -->
          <tr>
            <td align="center" style="padding:10px 24px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td bgcolor="{bleu}" style="background:{bleu};border-radius:8px;">
                  <a href="{app_url}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:{blanc};text-decoration:none;">
                    Ouvrir ma veille dans Adjuja
                  </a>
                </td>
              </tr></table>
            </td>
          </tr>

          <!-- Pied : la lune -->
          <tr>
            <td align="center" bgcolor="{espace}" style="background:{espace};border-top:1px solid {filet};padding:26px 24px 24px;border-radius:0 0 16px 16px;">
              <img src="{lune_url}" width="56" height="56" alt="" style="display:block;margin:0 auto 12px;">
              <p style="margin:0;font-size:17px;font-weight:700;color:{blanc};">Le prochain marché est peut-être déjà en ligne.</p>
              <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:{discret};">
                Vous recevez cet email parce que la veille est activée sur votre compte Adjuja.<br>
                <a href="{app_url}" style="color:{bleu_doux};font-weight:700;text-decoration:none;">Modifier mes secteurs ou la fréquence</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

_AO_CARD = """\
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="{panneau}"
       style="background:{panneau};border:1px solid {filet};border-radius:12px;margin:0 0 14px;">
  <tr>
    <td style="padding:16px 18px 4px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td bgcolor="{echeance_fond}" style="background:{echeance_fond};border-radius:6px;padding:5px 10px;">
          <span style="font-size:14px;font-weight:700;color:{echeance_couleur};">{echeance}</span>
        </td>
      </tr></table>
      <p style="margin:12px 0 0;font-size:17px;line-height:1.4;font-weight:700;color:{blanc};">{titre}</p>
      <p style="margin:6px 0 0;font-size:15px;line-height:1.5;color:{texte};">{acheteur_ville}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 18px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid {filet};">
        <tr>
          <td width="36%" style="padding:12px 8px 12px 0;vertical-align:top;">
            <p style="margin:0;font-size:14px;color:{discret};">Estimation</p>
            <p style="margin:3px 0 0;font-size:16px;font-weight:700;color:{estimation_couleur};">{estimation}</p>
          </td>
          <td width="30%" style="padding:12px 8px;vertical-align:top;">
            <p style="margin:0;font-size:14px;color:{discret};">Caution</p>
            <p style="margin:3px 0 0;font-size:16px;font-weight:700;color:{caution_couleur};">{caution}</p>
          </td>
          <td width="34%" style="padding:12px 0 12px 8px;vertical-align:top;">
            <p style="margin:0;font-size:14px;color:{discret};">Type</p>
            <p style="margin:3px 0 0;font-size:15px;font-weight:700;color:{type_couleur};">{type}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="border-top:1px solid {filet};padding:12px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:14px;color:{discret};">{reference}</td>
        <td align="right">
          <a href="{lien}" style="font-size:15px;font-weight:700;color:{bleu_doux};text-decoration:none;">Voir dans Adjuja &rarr;</a>
        </td>
      </tr></table>
    </td>
  </tr>
</table>
"""


def _jours(d: date | None) -> int | None:
    return None if d is None else (d - date.today()).days


def _echeance(d: date | None) -> tuple[str, str, str]:
    """(libelle, couleur du texte, fond) : compte a rebours, puis la date."""
    j = _jours(d)
    if d is None or j is None:
        return "Date limite non publiée", NEUTRE, NEUTRE_FOND
    date_txt = d.strftime("%d/%m/%Y")
    if j < 0:
        return f"Clôturé le {date_txt}", DISCRET, NEUTRE_FOND
    if j == 0:
        return f"Dernier jour · {date_txt}", ROUGE, ROUGE_FOND
    libelle = f"J-{j} · {date_txt}"
    if j <= 3:
        return libelle, ROUGE, ROUGE_FOND
    if j <= 7:
        return libelle, AMBRE, AMBRE_FOND
    return libelle, NEUTRE, NEUTRE_FOND


def _montant(v: Decimal | None, zero: str | None = None) -> tuple[str, str]:
    """(texte, couleur). Montant exact au format francais (1 779 718,56 DH),
    centimes omis s'ils sont nuls. Absent = non publie par le portail.
    `zero` : libelle d'un montant nul publie (« Non exigée » pour une caution :
    le portail publie 0 quand aucune caution n'est demandee, l'email
    affichait « 0 DH », signale le 2026-10-02)."""
    if v is None:
        return "Non publiée", DISCRET
    if zero is not None and v == 0:
        return zero, DISCRET
    entier, _, centimes = f"{v:,.2f}".partition(".")
    texte = entier.replace(",", "&#8239;")  # espace fine insecable
    if centimes != "00":
        texte += f",{centimes}"
    return f"{texte}&nbsp;DH", BLANC


def _ville(v: str | None) -> str | None:
    """« TANGER-ASSILAH...TANGER-ASSILAH » (province...ville du portail) :
    parties dedoublonnees, dans l'ordre."""
    if not v:
        return None
    parties = [p.strip() for p in v.split("...") if p.strip()]
    return " · ".join(dict.fromkeys(parties)) or None


def _acheteur(v: str | None) -> str | None:
    """Certaines sources prefixent le nom : « Acheteur :CDG CAPITAL »."""
    if not v:
        return None
    for prefixe in ("acheteur :", "acheteur:", "acheteur public :", "acheteur public:"):
        if v.lower().startswith(prefixe):
            v = v[len(prefixe):]
            break
    return v.strip() or None


# Le portail ne publie pas la portee (verifie le 2026-09-30 sur une fiche reelle
# et sur ses filtres de recherche) : on ne l'affiche que si l'objet de l'avis la
# dit en toutes lettres. « Salon international du livre » ne dit rien de la
# portee de l'appel d'offres : seules les formes « appel d'offres (ouvert)
# international » et leurs sigles comptent.
_AO = r"(?:appel\s+d['\u2019]\s*offres?|\bAO)\s+(?:ouvert\s+)?(?:sur\s+offres?\s+de\s+prix\s+)?"
_INTERNATIONAL = re.compile(_AO + r"internationa|\bAOO?I\b", re.IGNORECASE)
_NATIONAL = re.compile(_AO + r"nationa|\bAOO?N\b", re.IGNORECASE)


def _portee(titre: str | None, portee_analyse: str | None) -> str | None:
    """« International » / « National » seulement si c'est ecrit : dans l'objet
    de l'avis, sinon dans le RC (analyse). Jamais devine."""
    if titre and _INTERNATIONAL.search(titre):
        return "International"
    if titre and _NATIONAL.search(titre):
        return "National"
    return {"internationale": "International", "nationale": "National"}.get((portee_analyse or "").strip().lower())


def _sujet(n: int) -> tuple[str, str]:
    if n == 1:
        return "1 nouvel appel d'offres capté", "Adjuja : 1 nouvel appel d'offres pour vous"
    return f"{n} nouveaux appels d'offres captés", f"Adjuja : {n} nouveaux appels d'offres pour vous"


class AoDigestTemplate(NotificationTemplate):
    def render(self, context: dict) -> NotificationContent:
        aos: list[AoItem] = context["aos"]
        titre_email, subject = _sujet(len(aos))
        urgents = sum(1 for ao in aos if (j := _jours(ao.date_limite)) is not None and 0 <= j <= 7)
        sous_titre = (
            f"Classés par échéance, le plus proche en premier. {urgents} à rendre dans les 7 jours."
            if urgents else "Classés par échéance, le plus proche en premier."
        )

        cartes = []
        for ao in aos:
            echeance, echeance_couleur, echeance_fond = _echeance(ao.date_limite)
            estimation, estimation_couleur = _montant(ao.budget_estime)
            caution, caution_couleur = _montant(ao.caution, zero="Non exigée")
            # Portee (national / international) quand elle est ecrite, sinon la
            # procedure du portail.
            type_ao = _portee(ao.titre, ao.portee_analyse) or ao.mode_passation
            lieu = " · ".join(escape(x) for x in (_acheteur(ao.acheteur), _ville(ao.ville)) if x) or "Acheteur non publié"
            cartes.append(_AO_CARD.format(
                panneau=PANNEAU, filet=FILET, blanc=BLANC, texte=TEXTE, discret=DISCRET, bleu_doux=BLEU_DOUX,
                echeance=echeance, echeance_couleur=echeance_couleur, echeance_fond=echeance_fond,
                titre=escape(ao.titre),
                acheteur_ville=lieu,
                estimation=estimation, estimation_couleur=estimation_couleur,
                caution=caution, caution_couleur=caution_couleur,
                type=escape(type_ao) if type_ao else "Non publié",
                type_couleur=BLANC if type_ao else DISCRET,
                reference=f"Réf. {escape(ao.reference)}" if ao.reference else "",
                lien=escape(ao.lien, quote=True),
            ))

        html = _HTML.format(
            subject=escape(subject), preheader=escape(sous_titre),
            logo_url=LOGO_URL, terre_url=TERRE_URL, lune_url=LUNE_URL, app_url=APP_URL,
            date_du_jour=date.today().strftime("%d/%m/%Y"),
            titre_email=escape(titre_email), sous_titre=escape(sous_titre), ao_cards="".join(cartes),
            espace=ESPACE, nuit=NUIT, filet=FILET, blanc=BLANC, texte=TEXTE, discret=DISCRET,
            bleu=BLEU, bleu_doux=BLEU_DOUX, turquoise=TURQUOISE,
        )
        return NotificationContent(subject=subject, html=html, text=self._render_text(aos, subject))

    def _render_text(self, aos: list[AoItem], subject: str) -> str:
        lines = [subject, "=" * len(subject), "Classés par échéance, le plus proche en premier.", ""]
        for ao in aos:
            echeance, _, _ = _echeance(ao.date_limite)
            lines.append(f"- {ao.titre}")
            lines.append(f"  Échéance : {echeance}")
            if _acheteur(ao.acheteur):
                lines.append(f"  Acheteur : {_acheteur(ao.acheteur)}")
            if _ville(ao.ville):
                lines.append(f"  Ville : {_ville(ao.ville)}")
            for libelle, valeur, zero in (("Estimation", ao.budget_estime, None), ("Caution", ao.caution, "Non exigée")):
                texte, _ = _montant(valeur, zero=zero)
                lines.append(f"  {libelle} : {texte.replace('&#8239;', ' ').replace('&nbsp;', ' ')}")
            if type_ao := _portee(ao.titre, ao.portee_analyse) or ao.mode_passation:
                lines.append(f"  Type : {type_ao}")
            if ao.reference:
                lines.append(f"  Référence : {ao.reference}")
            lines.append(f"  Voir dans Adjuja : {ao.lien}")
            lines.append("")
        lines.append("Le prochain marché est peut-être déjà en ligne.")
        lines.append(f"Modifier mes secteurs ou la fréquence : {APP_URL}")
        return "\n".join(lines)
