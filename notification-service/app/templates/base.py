from abc import ABC, abstractmethod

from app.channels.base import NotificationContent


class NotificationTemplate(ABC):
    @abstractmethod
    def render(self, context: dict) -> NotificationContent:
        """Build a NotificationContent from context data. Never raises  returns fallback on error."""
