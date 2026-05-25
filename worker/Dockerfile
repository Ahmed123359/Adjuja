# ─────────────────────────────────────────────────────────────────────────────
# Worker  Scraper marchespublics.gov.ma
# Image multi-stage : build (deps) → final (runtime)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1 : installation des dépendances Python ────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2 : image runtime ───────────────────────────────────────────────────
FROM python:3.12-slim AS final

# Dépendances système pour Playwright/Chromium
# (liste minimale, évite apt-get install --no-install-recommends chromium
#  car playwright installe sa propre version)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copier les dépendances Python depuis le stage builder
COPY --from=builder /install /usr/local

WORKDIR /app

# Installer Playwright + télécharger Chromium (dans l'image, pas au runtime)
RUN playwright install chromium \
    && playwright install-deps chromium

# Créer un utilisateur non-root (sécurité)
RUN useradd --create-home --uid 1000 worker \
    && mkdir -p /app/data /app/output \
    && chown -R worker:worker /app

# Copier le code du worker
COPY --chown=worker:worker . /app/worker/

USER worker

# Variables d'environnement par défaut (surchargées par docker-compose / .env)
ENV WORKER_HEADLESS=true \
    WORKER_SLOW_MO=200 \
    WORKER_MAX_AOS=20 \
    WORKER_SCHEDULE_HOURS=6 \
    WORKER_DB_PATH=/app/data/ao_catalog.db \
    WORKER_OUTPUT_DIR=/app/output \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Lancer le worker comme module Python (permet les imports relatifs)
CMD ["python", "-m", "worker.main"]
