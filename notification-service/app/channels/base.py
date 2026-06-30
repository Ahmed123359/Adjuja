from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class NotificationContent:
    subject: str
    html: str
    text: str  # plaintext fallback  required by RFC 2822, improves deliverability


class NotificationChannel(ABC):
    @abstractmethod
    def send(self, recipient_email: str, content: NotificationContent) -> bool:
        """Send a notification. Returns True on success, False on soft failure."""

    @property
    @abstractmethod
    def channel_type(self) -> str:
        """String identifier stored in notification_log.channel (e.g. 'email_resend')."""
