# Roadmap — Worker de scraping OffrIA

Améliorations identifiées pour atteindre un niveau production, par ordre de priorité.

| # | Problème | Impact | Statut |
|---|----------|--------|--------|
| 1 | **Tests unitaires** — zéro couverture sur le worker | Critique | [ ] |
| 2 | **Pagination** — seule la première page de résultats est scrapée | Élevé | [ ] |
| 3 | **`max_aos` et déduplication** — si tous les AOs de la page sont déjà connus, les nouvelles AOs sur la page suivante ne sont jamais découvertes | Élevé | [ ] |
| 4 | **Retry sur erreur transitoire** — un téléchargement qui échoue (timeout réseau) reste en `erreur_scraping` jusqu'au prochain cycle complet | Moyen | [ ] |
| 5 | **Accumulation des fichiers debug** — les HTMLs de debug ne sont jamais nettoyés entre les cycles | Faible | [ ] |
| 6 | **Délais aléatoires** — `asyncio.sleep(2)` fixe entre chaque AO, peu naturel ; des délais aléatoires (1–4s) réduiraient le risque de détection | Faible | [ ] |
