"""
Envoie un email de test via le canal Resend configuré, pour vérifier
que la chaîne complète (clé API, domaine, template) fonctionne.
Run (depuis le container notification-api) : python test_send_email.py
"""
from datetime import date, timedelta

import app.channels.email.resend_channel  # noqa: F401  registers "email_resend"
from app.channels.factory import NotificationChannelFactory
from app.core.config import settings
from app.templates.ao_digest import AoDigestTemplate, AoItem
from app.templates.registry import TemplateRegistry

TemplateRegistry.register("ao_digest", AoDigestTemplate())

ao_items = [
    AoItem(
        titre="Étude de capitalisation des bonnes pratiques - Test ADJUJA",
        acheteur="Acheteur de démonstration",
        categorie="Études, formations et conseils",
        date_limite=date.today() + timedelta(days=10),
        url_source="https://app.adjuja.com/veille",
    ),
]

content = TemplateRegistry.get("ao_digest").render({"aos": ao_items})
channel = NotificationChannelFactory.create(settings.notification_channel)

print(f"Channel: {channel.channel_type}")
print(f"From: {settings.notification_from_name} <{settings.notification_from_email}>")
print(f"API key set: {bool(settings.resend_api_key)}")

sent = channel.send("hafidlaadimi2003@gmail.com", content)
print(f"Sent: {sent}")
