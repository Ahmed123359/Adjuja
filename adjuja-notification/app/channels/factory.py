from __future__ import annotations

from app.channels.base import NotificationChannel


class NotificationChannelFactory:
    """
    Registre de canaux. Ajouter un canal = un fichier + un décorateur.
    Aucune modification de cette classe n'est nécessaire.

    Usage:
        @NotificationChannelFactory.register("email_resend")
        class ResendEmailChannel(NotificationChannel): ...

        channel = NotificationChannelFactory.create("email_resend")
    """

    _registry: dict[str, type[NotificationChannel]] = {}

    @classmethod
    def register(cls, channel_type: str):
        def decorator(klass: type[NotificationChannel]) -> type[NotificationChannel]:
            cls._registry[channel_type] = klass
            return klass
        return decorator

    @classmethod
    def create(cls, channel_type: str) -> NotificationChannel:
        if channel_type not in cls._registry:
            available = list(cls._registry.keys())
            raise ValueError(
                f"Canal inconnu : '{channel_type}'. "
                f"Canaux enregistrés : {available}"
            )
        return cls._registry[channel_type]()

    @classmethod
    def available(cls) -> list[str]:
        return list(cls._registry.keys())
