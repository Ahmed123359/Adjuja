from dataclasses import dataclass
from datetime import date

from app.channels.base import NotificationContent
from app.templates.base import NotificationTemplate


@dataclass
class AoItem:
    titre: str
    acheteur: str | None
    categorie: str | None
    date_limite: date | None
    url_source: str


_HTML = """\
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;
                      box-shadow:0 2px 8px rgba(8,11,28,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#3248CE 0%,#2B79E8 100%);
                       padding:32px 40px 28px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;
                        letter-spacing:-0.3px;">ADJUJA Veille</p>
              <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.75);">
                {ao_count} nouvel{plural} appel{plural} d&apos;offres correspond{plural_v} à vos secteurs
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px 8px;">
              <p style="margin:0 0 24px;font-size:15px;color:#3D4560;line-height:1.6;">
                Bonjour,<br><br>
                Voici les appels d&apos;offres publiés aujourd&apos;hui qui correspondent
                à vos secteurs d&apos;activité préférés.
              </p>
              {ao_cards}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:8px 40px 32px;text-align:center;">
              <a href="https://app.adjuja.com/veille"
                 style="display:inline-block;background:#1BC9A8;color:#080B1C;
                        font-weight:700;font-size:14px;text-decoration:none;
                        border-radius:8px;padding:12px 28px;letter-spacing:0.2px;">
                Voir tous les AOs sur ADJUJA
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F4F6FB;border-top:1px solid #E8ECF5;
                       padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9AA3BF;line-height:1.6;">
                Vous recevez cet email parce que vous avez activé les alertes secteur sur ADJUJA.<br>
                <a href="https://app.adjuja.com/settings/notifications"
                   style="color:#3248CE;text-decoration:none;">
                  Gérer mes préférences
                </a>
                &nbsp;&middot;&nbsp;
                <a href="https://app.adjuja.com/settings/notifications?unsubscribe=1"
                   style="color:#9AA3BF;text-decoration:none;">
                  Se désabonner
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

_AO_CARD = """\
<table width="100%" cellpadding="0" cellspacing="0"
       style="border:1px solid #E8ECF5;border-radius:8px;margin-bottom:16px;
              overflow:hidden;">
  <tr>
    <td style="padding:16px 20px;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#1BC9A8;
                text-transform:uppercase;letter-spacing:0.5px;">
        {categorie}
      </p>
      <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#080B1C;
                line-height:1.4;">
        {titre}
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#6B7494;">
        {acheteur}
      </p>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-right:16px;">
            <span style="font-size:12px;color:#9AA3BF;">Date limite</span><br>
            <span style="font-size:13px;font-weight:600;color:{deadline_color};">
              {date_limite}
            </span>
          </td>
        </tr>
      </table>
      <p style="margin:12px 0 0;">
        <a href="{url_source}"
           style="font-size:13px;color:#3248CE;text-decoration:none;font-weight:600;">
          Voir le dossier &rarr;
        </a>
      </p>
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
        return "Non précisée"
    return d.strftime("%d/%m/%Y")


class AoDigestTemplate(NotificationTemplate):
    def render(self, context: dict) -> NotificationContent:
        aos: list[AoItem] = context["aos"]
        n = len(aos)

        cards_html = "".join(
            _AO_CARD.format(
                categorie=ao.categorie or "Appel d'offres",
                titre=ao.titre,
                acheteur=ao.acheteur or "Acheteur non précisé",
                date_limite=_format_date(ao.date_limite),
                deadline_color=_deadline_color(ao.date_limite),
                url_source=ao.url_source,
            )
            for ao in aos
        )

        plural = "s" if n > 1 else ""
        plural_v = "ent" if n > 1 else ""
        subject = f"ADJUJA  {n} nouvel{'s' if n > 1 else ''} AO{'s' if n > 1 else ''} pour vous"

        html = _HTML.format(
            subject=subject,
            ao_count=n,
            plural=plural,
            plural_v=plural_v,
            ao_cards=cards_html,
        )

        text = self._render_text(aos, subject)
        return NotificationContent(subject=subject, html=html, text=text)

    def _render_text(self, aos: list[AoItem], subject: str) -> str:
        lines = [subject, "=" * len(subject), ""]
        for ao in aos:
            lines.append(f"- {ao.titre}")
            if ao.acheteur:
                lines.append(f"  Acheteur : {ao.acheteur}")
            if ao.date_limite:
                lines.append(f"  Date limite : {_format_date(ao.date_limite)}")
            lines.append(f"  Lien : {ao.url_source}")
            lines.append("")
        lines.append("Gérer vos préférences : https://app.adjuja.com/settings/notifications")
        return "\n".join(lines)
