from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.channels.base import NotificationContent
from app.templates.base import NotificationTemplate

LOGO_URL = "https://adjuja.com/logo-adjuja.png"


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


_HTML = """\
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>{subject}</title>
</head>
<body style="margin:0;padding:0;background:#EEF1F9;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;">
    {preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F9;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(8,11,28,0.10);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(120deg,#3248CE 0%,#2B79E8 55%,#1BC9A8 100%);
                       padding:28px 36px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;">
                    <img src="{logo_url}" width="40" height="40" alt="ADJUJA"
                         style="display:block;border-radius:10px;">
                  </td>
                  <td style="vertical-align:middle;">
                    <p style="margin:0;font-size:19px;font-weight:800;color:#ffffff;
                              letter-spacing:-0.2px;">ADJUJA</p>
                    <p style="margin:1px 0 0;font-size:12px;color:rgba(255,255,255,0.82);">
                      Veille des appels d&apos;offres
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0;font-size:14.5px;color:#ffffff;font-weight:600;">
                {header_line}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 36px 8px;">
              <p style="margin:0 0 22px;font-size:14.5px;color:#3D4560;line-height:1.6;">
                Bonjour,<br><br>
                Voici les appels d&apos;offres qui correspondent à vos secteurs suivis.
              </p>
              {ao_cards}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:8px 36px 32px;text-align:center;">
              <a href="https://adjuja.com/app"
                 style="display:inline-block;background:#1BC9A8;color:#062A22;
                        font-weight:700;font-size:14px;text-decoration:none;
                        border-radius:10px;padding:13px 30px;letter-spacing:0.1px;">
                Voir tous les appels d&apos;offres
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F6F8FC;border-top:1px solid #E8ECF5;
                       padding:22px 36px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9AA3BF;line-height:1.7;">
                Vous recevez cet email car les notifications sont activées sur votre compte ADJUJA.<br>
                <a href="https://adjuja.com/app"
                   style="color:#3248CE;text-decoration:none;font-weight:600;">
                  Gérer mes préférences
                </a>
                &nbsp;&middot;&nbsp;
                <a href="https://adjuja.com"
                   style="color:#9AA3BF;text-decoration:none;">
                  adjuja.com
                </a>
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

# Structure inspiree d'un format de digest AO courant (bandeau acheteur/reference,
# lignes libelle/valeur en 2 colonnes, encadre titre) -- reproduite avec la palette
# de marque ADJUJA (degrade bleu/teal) plutot que celle de la reference.
_AO_CARD = """\
<table width="100%" cellpadding="0" cellspacing="0"
       style="border:1px solid #E8ECF5;border-radius:12px;overflow:hidden;margin-bottom:14px;">
  <tr>
    <td style="background:linear-gradient(120deg,#3248CE 0%,#2B79E8 60%,#1BC9A8 100%);padding:14px 18px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px;font-weight:700;color:#ffffff;line-height:1.4;">
            {acheteur}
          </td>
          <td align="right" style="font-size:11.5px;font-weight:600;color:rgba(255,255,255,0.85);
                                    white-space:nowrap;padding-left:12px;vertical-align:top;">
            N&deg; {reference}
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" style="padding:10px 18px;border-bottom:1px solid #E8ECF5;border-right:1px solid #E8ECF5;">
            <span style="font-size:11.5px;color:#080B1C;">Date limite : </span>
            <span style="font-size:11.5px;font-weight:700;color:{deadline_color};">{date_limite}</span>
          </td>
          <td width="50%" style="padding:10px 18px;border-bottom:1px solid #E8ECF5;">
            <span style="font-size:11.5px;color:#080B1C;">Ville : </span>
            <span style="font-size:11.5px;font-weight:700;color:#1BC9A8;">{ville}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:10px 18px;border-bottom:1px solid #E8ECF5;">
      <span style="font-size:11.5px;color:#080B1C;">Type : </span>
      <span style="font-size:11.5px;font-weight:700;color:#2B79E8;">{mode_passation}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" style="padding:10px 18px;border-right:1px solid #E8ECF5;">
            <span style="font-size:11.5px;color:#080B1C;">Estimation : </span>
            <span style="font-size:11.5px;font-weight:700;color:#1BC9A8;">{budget_estime}</span>
          </td>
          <td width="50%" style="padding:10px 18px;">
            <span style="font-size:11.5px;color:#080B1C;">Caution : </span>
            <span style="font-size:11.5px;font-weight:700;color:#1BC9A8;">{caution}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:14px 18px 16px;background:#F6F8FC;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#080B1C;line-height:1.5;">
        {titre}
      </p>
      <a href="{url_source}"
         style="font-size:12.5px;color:#3248CE;text-decoration:none;font-weight:600;">
        Voir le dossier &rarr;
      </a>
    </td>
  </tr>
</table>
"""


def _deadline_color(d: date | None) -> str:
    if d is None:
        return "#6B7494"
    delta = (d - date.today()).days
    if delta <= 3:
        return "#E53E3E"
    if delta <= 7:
        return "#DD6B20"
    return "#2D3748"


def _format_date(d: date | None) -> str:
    if d is None:
        return "non précisée"
    return d.strftime("%d/%m/%Y")


def _format_amount(v: Decimal | None) -> str:
    if v is None:
        return "non précisé"
    formatted = f"{v:,.2f}".replace(",", " ").replace(".", ",")
    return f"{formatted} DH"


class AoDigestTemplate(NotificationTemplate):
    def render(self, context: dict) -> NotificationContent:
        aos: list[AoItem] = context["aos"]
        n = len(aos)

        cards_html = "".join(
            _AO_CARD.format(
                titre=ao.titre,
                acheteur=ao.acheteur or "Acheteur non précisé",
                reference=ao.reference or "non précisée",
                date_limite=_format_date(ao.date_limite),
                deadline_color=_deadline_color(ao.date_limite),
                ville=ao.ville or "non précisée",
                mode_passation=ao.mode_passation or "non précisé",
                budget_estime=_format_amount(ao.budget_estime),
                caution=_format_amount(ao.caution),
                url_source=ao.url_source,
            )
            for ao in aos
        )

        if n == 1:
            subject = "ADJUJA : 1 nouvel appel d'offres pour vous"
            header_line = "1 nouvel appel d'offres correspond à vos secteurs"
        else:
            subject = f"ADJUJA : {n} nouveaux appels d'offres pour vous"
            header_line = f"{n} nouveaux appels d'offres correspondent à vos secteurs"

        html = _HTML.format(
            subject=subject,
            preheader=header_line,
            logo_url=LOGO_URL,
            header_line=header_line,
            ao_cards=cards_html,
        )

        text = self._render_text(aos, subject)
        return NotificationContent(subject=subject, html=html, text=text)

    def _render_text(self, aos: list[AoItem], subject: str) -> str:
        lines = [subject, "=" * len(subject), ""]
        for ao in aos:
            lines.append(f"- {ao.titre}")
            if ao.reference:
                lines.append(f"  Référence : {ao.reference}")
            if ao.acheteur:
                lines.append(f"  Acheteur : {ao.acheteur}")
            if ao.mode_passation:
                lines.append(f"  Type : {ao.mode_passation}")
            if ao.date_limite:
                lines.append(f"  Date limite : {_format_date(ao.date_limite)}")
            if ao.ville:
                lines.append(f"  Ville : {ao.ville}")
            if ao.budget_estime is not None:
                lines.append(f"  Estimation : {_format_amount(ao.budget_estime)}")
            if ao.caution is not None:
                lines.append(f"  Caution : {_format_amount(ao.caution)}")
            lines.append(f"  Lien : {ao.url_source}")
            lines.append("")
        lines.append("Gérer vos préférences : https://adjuja.com/app")
        return "\n".join(lines)
