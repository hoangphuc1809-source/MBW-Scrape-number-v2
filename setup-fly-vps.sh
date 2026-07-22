#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${1:-scraper-vps}"
REGION="${2:-iad}"
ORG="${3:-personal}"

echo "[1/5] Install flyctl..."
curl -L https://fly.io/install.sh | sh

export FLYCTL_INSTALL="${HOME}/.fly"
export PATH="${FLYCTL_INSTALL}/bin:${PATH}"

echo "[2/5] Authenticate..."
echo "⚠️  Nếu chưa login, chạy: fly auth login"
fly auth whoami || { echo "Hãy chạy 'fly auth login' trước"; exit 1; }

echo "[3/5] Launch app ${APP_NAME} in region ${REGION}..."
cat > fly.toml <<EOF
app = "${APP_NAME}"
primary_region = "${REGION}"

[build]
  [build.args]
    NODE_VERSION = "20"

[env]
  NODE_ENV = "production"
  NODE_OPTIONS = "--max_old_space_size=512"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
EOF

fly launch --no-deploy --org "${ORG}" --region "${REGION}" --name "${APP_NAME}"

echo "[4/5] Scale machine: 1 shared CPU, 256MB RAM, 3GB disk..."
fly scale vm shared-cpu-1x --memory 256 --app "${APP_NAME}"
fly volumes create scraper_data --size 3 --region "${REGION}" --app "${APP_NAME}" || true

echo "[5/5] Write startup script + redeploy..."
cat > Dockerfile <<'DOCKER'
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    git htop curl ca-certificates gnupg \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
    fonts-liberation libappindicator3-1 xdg-utils wget \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --production || npm install --production
COPY . .
# Cài đặt browser cho Playwright
RUN npx playwright install chromium
# Tạo swap 2GB
RUN fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
EXPOSE 8080
CMD ["node", "src/cli.js"]
DOCKER

echo "✅ Fly app ready. Now run: fly deploy --app ${APP_NAME}"
