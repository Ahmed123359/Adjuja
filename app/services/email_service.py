import logging
import httpx

logger = logging.getLogger(__name__)

_RESEND_URL = "https://api.resend.com/emails"
_FROM       = "OffrIA <noreply@offria.cloud>"


async def send_verification_email(
    to_email:       str,
    token:          str,
    api_base_url:   str,
    resend_api_key: str,
) -> None:
    """
    Envoie l'email de vérification via Resend.

    api_base_url : URL racine de l'API (ex: https://offria.fr ou http://localhost:8000)
    Si resend_api_key est vide, logue simplement le lien (mode dev).
    """
    base = api_base_url.rstrip('/').replace('http://', 'https://')
    verify_url = f"{base}/api/v1/auth/verify-email?token={token}"

    if not resend_api_key:
        logger.info("DEV — lien de vérification email : %s", verify_url)
        return

    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:40px auto;">
      <div style="background:linear-gradient(135deg,#4338ca,#6366f1);
                  border-radius:12px;padding:6px 16px;display:inline-block;margin-bottom:24px;">
        <span style="color:#fff;font-weight:700;font-size:18px;">Offr<span>IA</span></span>
      </div>
      <h2 style="color:#1e1b4b;margin-bottom:8px;">Confirmez votre adresse email</h2>
      <p style="color:#475569;">Cliquez sur le bouton ci-dessous pour activer votre compte
         et accéder à vos 3 générations gratuites.</p>
      <a href="{verify_url}"
         style="display:inline-block;margin:24px 0;padding:12px 28px;
                background:linear-gradient(135deg,#4338ca,#6366f1);
                color:#fff;border-radius:10px;font-weight:600;
                text-decoration:none;font-size:15px;">
        Confirmer mon email
      </a>
      <p style="color:#94a3b8;font-size:13px;">
        Ce lien expire dans 24h. Si vous n'avez pas créé de compte, ignorez cet email.
      </p>
    </div>
    """

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
                    "subject": "Confirmez votre adresse email — OffrIA",
                    "html":    html,
                },
            )
            if resp.status_code >= 400:
                logger.error("Resend error %s : %s", resp.status_code, resp.text)
            else:
                logger.info("Email de vérification envoyé à %s", to_email)
    except Exception as exc:
        logger.error("Impossible d'envoyer l'email de vérification : %s", exc)