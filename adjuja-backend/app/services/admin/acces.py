"""Qui administre la plateforme.

Une seule source : `settings.admin_emails` (`ADMIN_EMAILS` dans `.env`), déjà
utilisée pour les générations illimitées. Pas de colonne en base : la liste
change par un redéploiement, pas par une écriture qu'une faille pourrait faire.
"""

from app.config.settings import Settings
from app.models.user import UserPublic


def adresse_admin(email: str, settings: Settings) -> bool:
    """Vrai si l'adresse figure dans ADMIN_EMAILS (sans casse ni espaces)."""
    cible = email.strip().lower()
    return bool(cible) and cible in {e.strip().lower() for e in settings.admin_emails}


def est_admin_plateforme(user: UserPublic, settings: Settings) -> bool:
    """Adresse dans la liste ET boîte prouvée. La vérification compte : sans
    elle, s'inscrire le premier avec une adresse admin suffisait (voir
    context/bugs-connus.md, inscription sans vérification)."""
    return user.email_verified and adresse_admin(user.email, settings)
