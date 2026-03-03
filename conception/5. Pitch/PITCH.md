<!-- PITCH.md — Présentation commerciale OffrIA -->

<div align="center">

```
 ██████╗ ███████╗███████╗██████╗ ██╗ █████╗
██╔═══██╗██╔════╝██╔════╝██╔══██╗██║██╔══██╗
██║   ██║█████╗  █████╗  ██████╔╝██║███████║
██║   ██║██╔══╝  ██╔══╝  ██╔══██╗██║██╔══██║
╚██████╔╝██║     ██║     ██║  ██║██║██║  ██║
 ╚═════╝ ╚═╝     ╚═╝     ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝
```

### **L'IA qui remporte vos marchés.**

*Présenté par **Mohamed Echcharif EL JAZOULI** — Lead Data Scientist*

---

</div>

---

## Le problème : des milliards en jeu, des heures perdues

> *Chaque année, plus de **100 milliards d'euros** de marchés publics sont publiés en France.*
> *La grande majorité reste sans réponse — non par manque de compétence, mais par manque de temps.*

Répondre à un appel d'offres, c'est :

| Tâche | Temps moyen |
|---|---|
| Lire et analyser le cahier des charges | 4 à 8 heures |
| Identifier les critères de sélection | 2 à 4 heures |
| Rédiger la réponse technique | 8 à 20 heures |
| Relire, reformuler, adapter | 2 à 6 heures |
| **Total** | **16 à 38 heures par AO** |

Et au bout du compte ? **Un taux de succès moyen de 20 à 30 %.**

Les PME et ETI renoncent à des marchés qu'elles pourraient remporter.
Les grands groupes mobilisent des équipes entières — pour un résultat souvent générique.

**Le problème n'est pas le talent. C'est l'échelle.**

---

## La vision : et si une IA lisait l'AO à votre place ?

<div align="center">

```
   Appel d'offres PDF
          │
          ▼
   ┌─────────────┐
   │  OFFRIA AI  │  ← Analyse · Comprend · Rédige
   └─────────────┘
          │
          ▼
  Réponse structurée
  prête à soumettre
     en < 2 min
```

</div>

**OffrIA** est une plateforme d'IA générative spécialisée dans la réponse aux appels d'offres.
Elle analyse le document, identifie les critères clés, et génère une réponse professionnelle,
structurée et sur-mesure — en quelques secondes.

---

## La solution : un moteur IA multi-modèle, prêt à l'emploi

### Ce que OffrIA fait pour vous

- **Parsing intelligent** — Extraction automatique du titre, des critères de sélection,
  du budget, des sections et du type de marché
- **Génération multi-appels** — 1 brief stratégique + 8 sections rédigées en parallèle
  (9 appels LLM simultanés) pour une réponse cohérente et complète
- **Base de connaissances RAG** — Vos références clients, certifications et méthodologies
  internes enrichissent automatiquement chaque section (Qdrant + OpenAI embeddings)
- **Prompt engineering métier** — Construction d'un prompt contextualisé intégrant votre
  profil entreprise, vos références et vos atouts concurrentiels
- **Multi-LLM** — Choisissez le modèle adapté à votre besoin :

| Provider | Modèle recommandé | Point fort |
|---|---|---|
| **Anthropic** | Claude Opus | Raisonnement long, documents complexes |
| **OpenAI** | GPT-4o | Créativité, formulation commerciale |
| **Mistral AI** | Mistral Large | Souveraineté des données, hébergement EU |

- **API REST** — Intégrable dans n'importe quel workflow existant (ERP, CRM, SharePoint…)
- **Infrastructure Docker** — Déployable en 5 minutes, on-premise ou cloud

---

## Pourquoi maintenant ? Pourquoi OffrIA ?

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   "Les entreprises qui adopteront l'IA dans leurs processus    │
│    commerciaux d'ici 2026 captureront 30 % de parts de marché  │
│    supplémentaires sur les marchés publics."                    │
│                                           — McKinsey, 2024     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Nos différenciateurs

| Fonctionnalité | Concurrents | **OffrIA** |
|---|:---:|:---:|
| Multi-provider LLM | ✗ | ✓ |
| Parsing AO automatique | Partiel | ✓ |
| Génération multi-sections en parallèle | ✗ | ✓ |
| Base de connaissances RAG (vos docs) | ✗ | ✓ |
| Profil entreprise contextualisé | ✗ | ✓ |
| API intégrable (REST) | ✗ | ✓ |
| Hébergement souverain (Mistral) | ✗ | ✓ |
| Open-source core | ✗ | ✓ |

---

## L'impact : des chiffres qui parlent

<div align="center">

| Avant OffrIA | Après OffrIA |
|:---:|:---:|
| 16–38h par réponse | **< 2 minutes** |
| 1 à 3 AO / mois | **10 à 50 AO / mois** |
| Coût moyen : 3 000 € | **Coût : quelques centimes** |
| Taux de réponse : 20 % | **Objectif : 80 %+** |

</div>

> **Chaque AO auquel vous ne répondez pas est un marché que vous offrez à la concurrence.**

---

## Architecture technique (pour les curieux)

```
Client (Interface React / ERP / Postman)
        │  POST /api/v1/generate
        ▼
   FastAPI Router
        │
        ▼
  GenerationService ──► AOParserService       (extraction des données AO)
        │           ──► Appel LLM #1          (brief stratégique)
        │           └──► × 8 en parallèle :
        │                 ├─ RagService       (extraits Qdrant par section)
        │                 ├─ PromptBuilder    (prompt contextualisé)
        │                 └─ Appel LLM        (rédaction section)
        ▼
  ProviderFactory
   ├── AnthropicProvider  →  Claude API
   ├── OpenAIProvider     →  GPT API
   └── MistralProvider    →  Mistral API

  Qdrant (base vectorielle) ◄── rag-etl (microservice ETL, démarrage indépendant)
                                         └─ knowledge_base/ (vos PDF, DOCX, TXT)
```

Stack : **Python 3.12 · FastAPI · Pydantic v2 · React · Vite · Tailwind · Qdrant · Docker · Multi-LLM**

---

## Roadmap : ce n'est que le début

- **v1.0** *(livré)* — API REST, parsing AO, multi-LLM, Docker
- **v1.5** *(livré)* — Interface web React, upload PDF natif, génération multi-sections en parallèle
- **v2.0** *(livré)* — Base de connaissances RAG (Qdrant), microservice ETL indépendant, embeddings OpenAI
- **v3.0** — Fine-tuning sur corpus d'AO remportés, scoring prédictif, exports Word/PDF
- **v4.0** — Apprentissage continu (feedback loop), conformité RGPD certifiée

---

## À propos

<div align="center">

**Mohamed Echcharif EL JAZOULI**
*Lead Data Scientist*

*Architecte de la solution OffrIA — du prompt engineering à l'infrastructure cloud*

---

*"Je n'ai pas créé un chatbot. J'ai créé un commercial qui ne dort jamais,*
*ne se fatigue pas, et répond à 50 appels d'offres pendant que vous dormez."*

</div>

---

<div align="center">

**Prêt à remporter plus de marchés ?**

```
git clone https://github.com/offria/offria-api
docker compose up
# Votre premier AO généré en 90 secondes.
```

*OffrIA — Parce que chaque appel d'offres mérite une vraie réponse.*

</div>
