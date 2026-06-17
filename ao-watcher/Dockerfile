FROM python:3.12-slim

WORKDIR /app

# System deps for Playwright + lxml
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    libxrandr2 \
    libxfixes3 \
    libxdamage1 \
    libxcomposite1 \
    libcups2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install chromium --with-deps

COPY . .

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
