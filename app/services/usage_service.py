class UsageService:
    """Compteur en mémoire des tokens consommés et des appels effectués."""

    def __init__(self) -> None:
        self._tokens: int = 0
        self._appels: int = 0

    @property
    def total_tokens(self) -> int:
        return self._tokens

    @property
    def total_appels(self) -> int:
        return self._appels

    def add(self, tokens: int) -> None:
        """Incrémente le compteur après une génération réussie."""
        self._tokens += tokens
        self._appels += 1

    def reset(self) -> None:
        """Remet les compteurs à zéro."""
        self._tokens = 0
        self._appels = 0
