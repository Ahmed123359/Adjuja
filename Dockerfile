# ─────────────────────────────────────────────
# Étape 1 : Build du frontend React (Node.js)
# ─────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ .
RUN npm run build

# ─────────────────────────────────────────────
# Étape 2 : builder Python — installe les dépendances
# ─────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt

# ─────────────────────────────────────────────
# Étape 3a : dev — API seule, sans frontend (servi séparément)
# ─────────────────────────────────────────────
FROM python:3.12-slim AS api-dev

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
WORKDIR /app
COPY --from=builder /install /usr/local
COPY app/ ./app/
COPY company_defaults.json ./
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ─────────────────────────────────────────────
# Étape 3b : image finale prod — légère, sans outils de build
# ─────────────────────────────────────────────
FROM python:3.12-slim AS final

# Utilisateur non-root pour la sécurité
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

WORKDIR /app

# Copie les dépendances Python depuis le builder
COPY --from=builder /install /usr/local

# Copie le code source Python
COPY app/ ./app/

# Copie le fichier de configuration des valeurs par défaut
COPY company_defaults.json ./

# Copie le build React depuis le frontend-builder
COPY --from=frontend-builder /frontend/dist ./frontend/dist/

# Change le propriétaire des fichiers
RUN chown -R appuser:appgroup /app
USER appuser

# Port exposé
EXPOSE 8000

# Healthcheck intégré
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# Lancement avec uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
