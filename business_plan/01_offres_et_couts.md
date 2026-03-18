# OffrIA — Offres & Analyse des Coûts

## Coût par génération (côté OffrIA)

Chaque génération = 9 appels LLM (brief + 8 sections en parallèle)

```
Tokens moyens / génération : ~27 000 input + ~13 500 output

Claude Sonnet 4.6  → ~0,28€ / génération
GPT-4o             → ~0,20€ / génération
GPT-4o-mini        → ~0,03€ / génération

Moyenne constatée  → ~0,22€ / génération
```

---

## Plans & Marges

| | Starter | Pro | Entreprise |
|---|---|---|---|
| **Prix client** | 79€/mois | 249€/mois | Sur devis (~1 200€) |
| **AOs inclus** | 50/mois | Illimités (~150/mois moy.) | Illimités (~400/mois moy.) |
| **Coût LLM** | ~11€ | ~33€ | ~88€ |
| **Coût serveur** | ~5€ | ~10€ | ~20€ |
| **Coût Qdrant** | 0€ | ~5€ (partagé) | ~65€ (dédié) |
| **Coût total** | ~16€ | ~48€ | ~173€ |
| **Marge brute** | ~63€ | ~201€ | ~1 027€ |
| **Marge %** | 80% | 81% | 86% |

---

## Détail des offres

### Starter — 79€/mois HT
- 50 AOs générés / mois
- 3 providers LLM (GPT-4o, Claude, Mistral)
- Export Word (.docx)
- Signatures instantanées illimitées
- 1 utilisateur
- Support e-mail (48h)
- ❌ Base documentaire RAG
- ❌ Chat avec tes documents

### Pro — 249€/mois HT
- Génération illimitée
- Digestion jusqu'à 50 documents* (RAG)
- 💬 Chat avec tes documents ✨ (Nouveau)
- 5 utilisateurs
- Signatures instantanées illimitées
- API REST (ERP / CRM)
- Historique complet des générations
- Support prioritaire (4h)

### Entreprise — Sur devis
- Génération illimitée
- Digestion jusqu'à 200 documents* (RAG dédié)
- 💬 Chat avec tes documents ✨ (Nouveau)
- Utilisateurs illimités
- Instance Qdrant dédiée (données souveraines)
- SSO / Active Directory
- Fine-tuning sur vos AOs remportés
- Signatures instantanées illimitées
- SLA 99,9% garanti
- Accompagnement dédié

**\* 1 document = fichier PDF jusqu'à 20 pages A4**

---

## Notes importantes

- **Plafond auto-entrepreneur** : 77 700€/an de CA → ~82 clients Starter ou ~26 clients Pro. Passer en société dès validation du modèle.
- **RAG Pro** : onboarding manuel à court terme (client envoie ses docs → indexation par OffrIA). Self-service à développer dès 10+ clients Pro.
- **RAG Entreprise** : instance Qdrant Cloud dédiée (~65$/mois répercutés dans le prix). Provisionné à la création du compte.
- **"Chat avec tes documents"** : feature à développer — chat interface sur la base Qdrant du client via LLM. Différenciateur fort vs concurrents.
- **Coûts LLM** : basés sur Claude Sonnet 4.6 et GPT-4o. Si les clients utilisent massivement GPT-4o-mini, la marge monte à ~90%.

---

## Seuil de rentabilité

| Clients | CA mensuel | Coûts | Résultat |
|---|---|---|---|
| 5 Starter | 395€ | 80€ | 315€ |
| 10 Starter | 790€ | 160€ | 630€ |
| 5 Pro | 1 245€ | 240€ | 1 005€ |
| 10 Pro | 2 490€ | 480€ | 2 010€ |
| 3 Pro + 1 Entreprise | 1 947€ | 317€ | 1 630€ |

Break-even VPS + outils (~100€/mois fixe) : **2 clients Starter** ou **1 client Pro**.

---

## À challenger

- [ ] Prix Starter à 79€ — est-ce que le marché Maghreb/Golfe accepte ce prix ?
- [ ] Limite 50 docs Pro vs 200 docs Entreprise — bonne différenciation ?
- [ ] "Chat avec tes documents" — feature clé à prioriser dans le dev ?
- [ ] Freemium : 3 AOs gratuits sans CB pour convertir ?
- [ ] Webhooks Stripe : automatiser l'activation des comptes