#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${1:-hermes-gateway}"

echo "=== SSH console vào Fly VM ==="
fly ssh console --app "${APP_NAME}"
