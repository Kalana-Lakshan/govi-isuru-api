#!/usr/bin/env bash
# Govi Isuru: start the whole system locally on Linux/macOS (AI service + API + web).
#
#   cd govi-isuru-api
#   ./scripts/start-local.sh             # no Docker: Python venv + Node; Ctrl+C stops everything
#   ./scripts/start-local.sh --docker    # MongoDB + AI service + API in Docker, web with npm
#
# Expects the three repos side by side: govi-isuru-ai-service/ govi-isuru-api/ govi-isuru-web/
# Without Docker you need MONGO_URI in govi-isuru-api/.env (e.g. a free MongoDB Atlas cluster).
set -euo pipefail

API="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(dirname "$API")"
AI="$ROOT/govi-isuru-ai-service"
WEB="$ROOT/govi-isuru-web"
AI_KEY="local-ai-key"
LOGS="$API/.local-logs"

for d in "$AI" "$WEB"; do
  [ -d "$d" ] || { echo "Missing $d: clone it next to govi-isuru-api"; exit 1; }
done

if [ ! -f "$API/.env" ]; then
  cp "$API/.env.example" "$API/.env"
  echo "Created govi-isuru-api/.env from .env.example: fill MONGO_URI and the secrets, then run again."
  exit 1
fi
[ -f "$WEB/.env.local" ] || printf 'API_URL=http://localhost:5000\nNEXT_PUBLIC_API_URL=\n' > "$WEB/.env.local"

if [ ! -f "$AI/bundle/decision.json" ]; then
  echo "No AI bundle yet: building the development bundle (random weights; real yield/suitability)."
  (cd "$AI" && python3 scripts/make_dev_bundle.py --out bundle)
fi

mkdir -p "$LOGS"
pids=()
cleanup() { echo "Stopping..."; kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

if [ "${1:-}" = "--docker" ]; then
  (cd "$API" && AI_SERVICE_KEY="$AI_KEY" docker compose up --build -d && docker compose ps)
else
  if [ ! -x "$AI/.venv/bin/python" ]; then
    echo "Creating the AI service virtual environment (first run only)..."
    (cd "$AI" && python3 -m venv .venv && .venv/bin/pip install -q -e '.[service]')
  fi
  (cd "$AI/service" && GOVI_BUNDLE_DIR="$AI/bundle" GOVI_API_KEY="$AI_KEY" GOVI_STATE_DIR="$AI/state" \
    "$AI/.venv/bin/python" -m uvicorn app.main:app --port 8000 > "$LOGS/ai.log" 2>&1) & pids+=($!)
  [ -d "$API/node_modules" ] || (cd "$API" && npm install)
  (cd "$API" && AI_SERVICE_URL=http://localhost:8000 AI_SERVICE_KEY="$AI_KEY" npm run dev > "$LOGS/api.log" 2>&1) & pids+=($!)
fi

[ -d "$WEB/node_modules" ] || (cd "$WEB" && npm install)
(cd "$WEB" && npm run dev > "$LOGS/web.log" 2>&1) & pids+=($!)

cat <<EOF

Started (logs in $LOGS):
  Web         http://localhost:3000
  API         http://localhost:5000/health
  AI service  http://localhost:8000/docs
The development AI bundle gives random diagnoses (marked dev_model); yield and suitability are real.
Press Ctrl+C to stop.
EOF
wait
