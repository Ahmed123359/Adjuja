# Améliorations signature PDF

## Branche : `feat/signature-improvements`

---

## 1. Enrichissement des mots-clés (approche classique pymupdf)

**Problème :** certaines zones de signature ne sont pas détectées car les tokens actuels
ne couvrent pas tous les cas rencontrés dans les documents marocains.

**Tokens actuels :**

```python
_SIG_TOKENS = ["signature", "signataire", "soumissionnaire"]
_CAC_TOKENS = ["cachet", "concurrent"]
```

**À enrichir :**

- [ ] Variantes arabes translittérées (ex: "soumissionnaire" écrit "soummissionnaire")
- [ ] "candidat", "titulaire", "attributaire" autres désignations du signataire
- [ ] "visa", "paraphe", "approuvé", "lu et approuvé"
- [ ] "représentant", "gérant", "directeur"
- [ ] "cachet de l'entreprise", "cachet officiel", "tampon"
- [ ] "entreprise", "société" (quand c'est le label d'un bloc signature)
- [ ] Tester sur un corpus de 10+ documents différents et noter les manques

---

## 2. Amélioration détection position (approche GPT-4o vision)

**Problème :** GPT-4o retourne des coordonnées en % mais elles sont souvent décalées
(à côté de la plaque). La signature ne tombe pas dans la bonne zone.

### 2a. Améliorer le prompt

- [ ] Demander à GPT-4o de retourner le **centre** du label plutôt que le bord gauche
- [ ] Tester avec `"detail": "low"` vs `"detail": "high"` voir si la précision change
- [ ] Ajouter des exemples few-shot dans le prompt (images exemples annotées)
- [ ] Demander aussi la **largeur** de la zone (`w_pct`) pour centrer l'image correctement
- [ ] Tester le prompt en français vs anglais

### 2b. Améliorer la conversion coordonnées → placement

- [ ] Ajouter un offset de calibration (GPT-4o a tendance à sous-estimer y)
- [ ] Utiliser `y_pct` comme **milieu** du label plutôt que bas → recalculer le gap
- [ ] Ajouter une validation : si les coords sont hors [0.5, 1.0] en y → suspect (zone en haut = faux positif)
- [ ] Logger les coordonnées brutes pour analyser les biais systématiques

### 2c. Approche alternative : bounding box via GPT-4o

- [ ] Au lieu de x/y pct, demander un rectangle complet `{x1, y1, x2, y2}` en %
- [ ] Placer la signature **dans** le rectangle retourné (pas juste en dessous)

---

## 3. Gestion des PDFs mixtes (pages texte + pages scannées)

- [ ] Détecter page par page si texte extractible (nb chars > seuil)
- [ ] Appliquer pymupdf sur les pages texte, GPT-4o sur les pages scannées
- [ ] N'envoyer à GPT-4o **que** les pages scannées (réduire le coût)

---

## 4. Tests & validation

- [ ] Constituer un corpus de test : 5+ documents avec zones de signature connues
- [ ] Mesurer taux de détection correcte (avant/après chaque amélioration)
- [ ] Comparer résultat visuel dans le notebook avant d'industrialiser

---

## État actuel

| Fonctionnalité              | Statut                              |
| --------------------------- | ----------------------------------- |
| Détection pymupdf (texte)   | ✅ Fonctionne, quelques cas manqués |
| Remplissage "Fait à"        | ✅ OK                               |
| Paraphe toutes pages        | ✅ OK                               |
| Détection GPT-4o (scanné)   | ⚠ Détection OK, positions décalées  |
| PDFs mixtes (page par page) | ❌ Non implémenté                   |
