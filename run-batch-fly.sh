#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${1:-scraper-vps}"
MODE="${2:-all}"
CLEAR_SHEET="${3:-false}"

case "${MODE}" in
  fpt)
    DEALER="FPT"
    ;;
  cps)
    DEALER="CPS"
    ;;
  mbw)
    DEALER="MBW"
    ;;
  all)
    DEALER="FPT CPS MBW"
    ;;
  *)
    echo "Usage: $0 [fpt|cps|mbw|all] [clear_sheet]"
    exit 1
    ;;
esac

echo "🚀 Running batch: ${DEALER}"
echo "📋 CLEAR_SHEET=${CLEAR_SHEET}"

for dealer in ${DEALER}; do
  echo "=== Scraping ${dealer} ==="
  CLEAR_SHEET="${CLEAR_SHEET}" OUTPUT_JSON=true node src/cli.js --dealer "${dealer}"
  echo "✅ ${dealer} done"
done

echo "🎉 All batches completed!"
