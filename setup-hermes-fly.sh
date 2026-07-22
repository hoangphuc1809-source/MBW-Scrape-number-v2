#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${1:-hermes-gateway}"
REGION="${2:-iad}"
ORG="${3:-personal}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "=== [1/5] Check flyctl ==="
if command -v fly >/dev/null 2>&1; then
  echo "flyctl already installed"
elif [ -x "$HOME/.fly/bin/flyctl" ]; then
  export FLYCTL_INSTALL="$HOME/.fly"
  export PATH="$FLYCTL_INSTALL/bin:$PATH"
  echo "flyctl already installed at $FLYCTL_INSTALL/bin"
else
  echo "⚠️  flyctl chưa có. Trên Windows chạy:"
  echo "  powershell -Command \"Set-ExecutionPolicy Bypass -Scope CurrentUser -Force; iwr https://fly.io/install.ps1 -useb | iex\""
  exit 1
fi

echo "=== [2/5] Check login ==="
if ! fly auth whoami >/dev/null 2>&1; then
  echo "⚠️  Chưa login Fly. Chạy: fly auth login"
  exit 1
fi

echo "=== [3/5] Tạo/Load app ${APP_NAME} ==="
if ! fly apps show "${APP_NAME}" >/dev/null 2>&1; then
  fly launch --no-deploy --org "${ORG}" --region "${REGION}" --name "${APP_NAME}" >/dev/null
fi

echo "=== [4/5] Scale free tier ==="
fly scale vm shared-cpu-1x --memory 256 --app "${APP_NAME}" || true
fly volumes create hermes_data --size 3 --region "${REGION}" --app "${APP_NAME}" --yes 2>/dev/null || true

echo "=== [5/5] Tạo Dockerfile + fly.toml ==="
cat > Dockerfile.hermes <<'DOCKER'
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates gnupg build-essential libffi-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*
# Swap 1GB
RUN fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && \
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
# Cài Hermes qua uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"
RUN uv pip install --system hermes-agent
ENV HERMES_HOME=/app/.hermes
RUN mkdir -p "${HERMES_HOME}" /app/workdir
WORKDIR /app/workdir
EXPOSE 8080
CMD ["sh", "-c", "swapon /swapfile && hermes gateway run --host 0.0.0.0 --port 8080"]
DOCKER

cat > fly.toml <<EOF
app = "${APP_NAME}"
primary_region = "${REGION}"

[build]
  dockerfile = "Dockerfile.hermes"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
EOF

EXTERNAL_IP=$(fly ips allocate-v4 --app "${APP_NAME}" --json 2>/dev/null | tr -d '"' || true)
echo ""
echo "✅ Config xong."
if [ -n "${EXTERNAL_IP}" ]; then
  echo "🌐 Public IP: ${EXTERNAL_IP}"
fi
echo ""
echo "Tiếp theo anh chạy:"
echo "  fly deploy --app ${APP_NAME}"
echo "Rồi SSH vào VM:"
echo "  fly ssh console --app ${APP_NAME}"
echo "Setup Hermes:"
echo "  hermes setup"
echo "Khởi động Gateway:"
echo "  hermes gateway install && hermes gateway start"
echo ""
