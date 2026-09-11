import logging

import resend

from app.channels.base import NotificationChannel, NotificationContent
from app.channels.factory import NotificationChannelFactory
from app.core.config import settings

logger = logging.getLogger(__name__)


@NotificationChannelFactory.register("email_resend")
class ResendEmailChannel(NotificationChannel):
    """Adapter Resend. Swapper contre BrevoEmailChannel = changer NOTIFICATION_CHANNEL dans .env."""

    def __init__(self) -> None:
        resend.api_key = settings.resend_api_key

    @property
    def channel_type(self) -> str:
        return "email_resend"

    def send(self, recipient_email: str, content: NotificationContent) -> bool:
        if not settings.resend_api_key:
            logger.warning("RESEND_API_KEY manquante  email non envoyé à %s", recipient_email)
            return False

        try:
            resend.Emails.send({
                "from": f"{settings.notification_from_name} <{settings.notification_from_email}>",
                "to": [recipient_email],
                "subject": content.subject,
                "html": content.html,
                "text": content.text,
            })
            logger.info("Email envoyé à %s", recipient_email)
            return True
        except Exception:
            logger.exception("Échec envoi email à %s", recipient_email)
            return False
