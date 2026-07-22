# Hermes Gateway on Fly.io - Windows bootstrap
$ErrorActionPreference = 'Stop'
$fly = 'C:\Users\Tran Hoang Phuc\.fly\bin\flyctl.exe'

$APP_NAME = 'hermes-gateway'
$REGION   = 'iad'
$ORG      = 'personal'

Write-Host "=== Auth check ==="
& $fly auth whoami

Write-Host "`n=== [1/4] Write fly.toml ==="
$toml = @"
app = "$APP_NAME"
primary_region = "$REGION"

[build]
  dockerfile = "Dockerfile.hermes"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
"@
Set-Content -Path fly.toml -Value $toml -NoNewline

Write-Host "=== [2/4] Launch app ==="
& $fly launch --no-deploy --org $ORG --region $REGION --name $APP_NAME

Write-Host "`n=== [3/4] Scale ==="
& $fly scale vm shared-cpu-1x --memory 256 --app $APP_NAME --yes

Write-Host "`n=== [4/4] Write Dockerfile.hermes ==="
$docker = @"
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates gnupg build-essential libffi-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*
RUN fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && \
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:`${PATH}"
RUN uv pip install --system hermes-agent
ENV HERMES_HOME=/app/.hermes
RUN mkdir -p "`${HERMES_HOME}" /app/workdir
WORKDIR /app/workdir
EXPOSE 8080
CMD ["sh", "-c", "swapon /swapfile && hermes gateway run --host 0.0.0.0 --port 8080"]
"@
Set-Content -Path Dockerfile.hermes -Value $docker -NoNewline

Write-Host "`n✅ Ready."
Write-Host "Next:"
Write-Host "  fly deploy --app $APP_NAME"
Write-Host "  fly ssh console --app $APP_NAME"
Write-Host "  hermes gateway setup"
Write-Host "  hermes gateway install && hermes gateway start"
