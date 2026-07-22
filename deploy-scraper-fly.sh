#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${1:-scraper-vps}"
REGION="${2:-iad}"
ORG="${3:-personal}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# Cài flyctl nếu chưa có
if ! command -v fly &>/dev/null; then
  echo "Installing flyctl..."
  curl -L https://fly.io/install.sh | sh
  export FLYCTL_INSTALL="${HOME}/.fly"
  export PATH="${FLYCTL_INSTALL}/bin:${PATH}"
fi

# Kiểm tra login
fly auth whoami >/dev/null 2>&1 || { echo "⚠️  Chưa login Fly. Chạy: fly auth login"; exit 1; }

# 1) Chuẩn bị config cho app
cat > fly.toml <<EOF
app = "${APP_NAME}"
primary_region = "${REGION}"

[build]
  [build.args]
    NODE_VERSION = "20"

[env]
  NODE_ENV = "production"
  NODE_OPTIONS = "--max_old_space_size=512"
  OUTPUT_JSON = "true"
  CLEAR_SHEET = "false"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
EOF

cat > Dockerfile <<'DOCKER'
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    git htop curl ca-certificates gnupg \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
    fonts-liberation libappindicator3-1 xdg-utils wget \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/node /usr/local/bin/node
WORKDIR /app
COPY package*.json ./
RUN npm ci --production || npm install --production
COPY . .
RUN npx playwright install chromium
# Tạo swap 2GB an toàn cho 256MB RAM
RUN fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && \
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
# Tạo thư mục chứa output
RUN mkdir -p /app/output
EXPOSE 8080
CMD ["node", "src/cli.js"]
DOCKER

# Nếu chưa có app thì tạo mới
if ! fly apps show "${APP_NAME}" >/dev/null 2>&1; then
  echo "Creating Fly app: ${APP_NAME}..."
  fly launch --no-deploy --org "${ORG}" --region "${REGION}" --name "${APP_NAME}" >/dev/null
fi

# Scale về đúng cấu hình free tier
echo "Scaling machine..."
fly scale vm shared-cpu-1x --memory 256 --app "${APP_NAME}" || true
fly volumes create scraper_data --size 3 --region "${REGION}" --app "${APP_NAME}" --yes 2>/dev/null || true

echo "✅ Config ready. Chạy: fly deploy --app ${APP_NAME}"
