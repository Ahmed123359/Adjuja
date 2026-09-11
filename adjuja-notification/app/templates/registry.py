from __future__ import annotations

from app.templates.base import NotificationTemplate


class TemplateRegistry:
    """
    Registre de templates par type d'événement.

    Usage:
        TemplateRegistry.register("ao_digest", AoDigestTemplate())
        template = TemplateRegistry.get("ao_digest")
        content  = template.render(context)
    """

    _registry: dict[str, NotificationTemplate] = {}

    @classmethod
    def register(cls, event_type: str, template: NotificationTemplate) -> None:
        cls._registry[event_type] = template

    @classmethod
    def get(cls, event_type: str) -> NotificationTemplate:
        if event_type not in cls._registry:
            available = list(cls._registry.keys())
            raise ValueError(
                f"Aucun template pour l'événement '{event_type}'. "
                f"Templates enregistrés : {available}"
            )
        return cls._registry[event_type]

    @classmethod
    def available(cls) -> list[str]:
        return list(cls._registry.keys())
