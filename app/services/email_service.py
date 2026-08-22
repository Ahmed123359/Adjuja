import logging
import httpx

logger = logging.getLogger(__name__)

_RESEND_URL = "https://api.resend.com/emails"
_FROM       = "ADJUJA <contact@adjuja.com>"
_LOGO_URL   = "https://adjuja.com/logo-adjuja.png"


def _otp_email_html(*, title: str, intro: str, otp: str, footer_note: str) -> str:
    preheader = f"{title} : {otp}"
    return f"""\
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#EEF1F9;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;">
    {preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F9;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(8,11,28,0.10);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(120deg,#3248CE 0%,#2B79E8 55%,#1BC9A8 100%);
                       padding:28px 36px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;">
                    <img src="{_LOGO_URL}" width="40" height="40" alt="ADJUJA"
                         style="display:block;border-radius:10px;">
                  </td>
                  <td style="vertical-align:middle;">
                    <p style="margin:0;font-size:19px;font-weight:800;color:#ffffff;
                              letter-spacing:-0.2px;">ADJUJA</p>
                    <p style="margin:1px 0 0;font-size:12px;color:rgba(255,255,255,0.82);">
                      Réponse aux appels d&apos;offres
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 36px 28px;text-align:center;">
              <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#080B1C;">
                {title}
              </p>
              <p style="margin:0 0 22px;font-size:14px;color:#6B7494;line-height:1.6;">
                {intro}
              </p>
              <div style="margin:0 0 22px;padding:18px 24px;background:#F6F8FC;
                          border:1px solid #E8ECF5;border-radius:12px;
                          font-size:32px;font-weight:800;letter-spacing:10px;color:#080B1C;">
                {otp}
              </div>
              <p style="margin:0;font-size:12.5px;color:#9AA3BF;line-height:1.6;">
                Ce code expire dans 15 minutes.<br>
                {footer_note}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F6F8FC;border-top:1px solid #E8ECF5;
                       padding:20px 36px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9AA3BF;">
                <a href="https://adjuja.com" style="color:#9AA3BF;text-decoration:none;">
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


async def _send_via_resend(
    *,
    to_email:       str,
    subject:        str,
    html:           str,
    resend_api_key: str,
    log_label:      str,
) -> None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _RESEND_URL,
                headers={
                    "Authorization": f"Bearer {resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from":    _FROM,
                    "to":      [to_email],
                    "subject": subject,
                    "html":    html,
                },
            )
            if resp.status_code >= 400:
                logger.error("Resend error %s : %s", resp.status_code, resp.text)
            else:
                logger.info("%s envoyé à %s", log_label, to_email)
    except Exception as exc:
        logger.error("Impossible d'envoyer %s : %s", log_label, exc)


async def send_verification_otp_email(
    to_email:       str,
    otp:            str,
    resend_api_key: str,
) -> None:
    """
    Envoie le code de vérification (OTP) d'inscription par email via Resend.

    Si resend_api_key est vide, logue simplement le code (mode dev).
    """
    if not resend_api_key:
        logger.info("DEV  code de vérification pour %s : %s", to_email, otp)
        return

    html = _otp_email_html(
        title="Confirmez votre adresse email",
        intro="Voici votre code de vérification pour activer votre compte ADJUJA.",
        otp=otp,
        footer_note="Si vous n&apos;avez pas créé de compte ADJUJA, ignorez cet email.",
    )
    await _send_via_resend(
        to_email=to_email,
        subject="Votre code de vérification ADJUJA",
        html=html,
        resend_api_key=resend_api_key,
        log_label="le code de vérification",
    )


async def send_password_reset_otp_email(
    to_email:       str,
    otp:            str,
    resend_api_key: str,
) -> None:
    """
    Envoie le code de réinitialisation de mot de passe par email via Resend.

    Si resend_api_key est vide, logue simplement le code (mode dev).
    """
    if not resend_api_key:
        logger.info("DEV  code de réinitialisation pour %s : %s", to_email, otp)
        return

    html = _otp_email_html(
        title="Réinitialisez votre mot de passe",
        intro="Voici votre code pour réinitialiser le mot de passe de votre compte ADJUJA.",
        otp=otp,
        footer_note="Si vous n&apos;êtes pas à l&apos;origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.",
    )
    await _send_via_resend(
        to_email=to_email,
        subject="Réinitialisation de votre mot de passe ADJUJA",
        html=html,
        resend_api_key=resend_api_key,
        log_label="le code de réinitialisation",
    )
