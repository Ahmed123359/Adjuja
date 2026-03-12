# Roadmap — Qualité de Génération des Sections

Améliorations des prompts et instructions de génération, identifiées suite à l'analyse de la note méthodologique ONSSA d'ABI Consulting.
Objectif : atteindre un rendu similaire à cette note (spécificité, structure, différenciation).

> Les améliorations KB et RAG pipeline sont dans `rag_service/ROADMAP.md`.

| # | Section | Amélioration | Impact | Statut |
|---|---------|-------------|--------|--------|
| 1 | Moyens humains | Ajouter sous-section "Dispositif de coordination" dans les instructions | Élevé | [ ] |
| 2 | Approche méthodologique | Forcer liaison phase → livrables quantifiés depuis l'AO | Élevé | [ ] |
| 3 | Planning | Découpage semaine/semaine si durée connue dans l'AO | Moyen | [ ] |
| 4 | Présentation entreprise | Structurer les points forts en liste numérotée contextualisée | Moyen | [ ] |

---

## Ce que fait ABI Consulting et qu'on doit reproduire

### Spécificité des chiffres
Chaque affirmation est ancrée dans les données de l'AO : "825 pépinières", "12 ateliers", "45 jours", "100 participants".
→ Le LLM doit extraire ces chiffres de l'AO et les réutiliser dans **chaque section concernée**, pas seulement dans "Compréhension des besoins".

### Structure méthodologique (Phase A → F)
```
Phase A : Cadrage (réunion de lancement)
Phase B : Atelier de démarrage (participants, lieu, contenus)
Phase C : 1ère visite terrain (durée, volume, outils)
Phase D : 2ème visite de suivi
Phase E : Ateliers de proximité
Phase F : Atelier de clôture
```
Chaque phase = objectif + activités détaillées + outils terrain (fiches, checklists, canevas) + livrables quantifiés + délai.

### Dispositif de coordination (différenciateur fort)
Section absente de la plupart des offres concurrentes :
- Réunions hebdomadaires de check-up
- Workplan mensuel : tâche / deadline / état / date réelle / source de vérification
- Validation des livrables en versions Draft puis finale

### Livrables quantifiés par phase
> "825 fiches d'évaluation + 825 rapports individuels + 12 comptes rendus d'ateliers"
Les livrables doivent reprendre les volumes de l'AO, pas rester génériques.

### Profils d'équipe nominaux et détaillés
| Profil | École nommée | Diplôme précis | Années exp. | Rôle sur CE marché |
Nécessite les CVs réels dans `knowledge_base/resources/` (voir `rag_service/ROADMAP.md` #2).

---

## Détail des améliorations

### #1 — Instructions "Moyens humains" : Dispositif de coordination

**Ajout dans les instructions de la section :**
```
6. Dispositif de pilotage (obligatoire) :
- Réunions de suivi : fréquence, participants, ordre du jour type
- Reporting : fréquence, format (workplan avec état d'avancement)
- Canal de communication : email/téléphone, versions draft puis finale
- Validation des livrables : qui valide, dans quel délai
```

**Pourquoi :** ce bloc est absent de presque toutes les offres concurrentes. Il rassure l'acheteur sur la maîtrise opérationnelle.

---

### #2 — Instructions "Approche méthodologique" : Phase → Livrables

**Ajout dans les instructions de la section :**
```
- Pour chaque phase : nommer les outils terrain si mentionnés dans l'AO
  (fiches de visite, checklists, canevas, référentiels...)
- Lier chaque phase à ses livrables avec les volumes de l'AO
  (ex: "825 rapports individuels" plutôt que "rapports individuels")
- Si les volumes ne sont pas dans l'AO : utiliser "par bénéficiaire" / "par site"
```

---

### #3 — Instructions "Planning" : Granularité semaine/semaine

**Ajout dans les instructions de la section :**
```
- Si la durée totale est ≤ 6 mois ET précisée dans l'AO :
  décomposer en semaines (S1, S2, S3...) plutôt qu'en mois génériques
- Si la durée est > 6 mois ou non précisée : garder les mois (M1, M2...)
```

---

### #4 — Instructions "Présentation entreprise" : Points forts structurés

**Ajout dans les instructions de la section :**
```
3. Points forts (liste numérotée, 4-6 points max) :
   Chaque point = 1 atout spécifique directement relié à un enjeu de CET AO.
   Format : "Expertise [domaine] : [preuve concrète ou mécanisme]"
   Interdit : points génériques applicables à n'importe quelle entreprise.
```
