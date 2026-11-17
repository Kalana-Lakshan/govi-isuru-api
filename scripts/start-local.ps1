# Govi Isuru: start the whole system locally on Windows (AI service + API + web), each in its own window.
#
#   cd govi-isuru-api
#   .\scripts\start-local.ps1            # no Docker: Python venv + Node (lightest on data and memory)
#   .\scripts\start-local.ps1 -Docker    # MongoDB + AI service + API in Docker, web with npm
#
# Expects the three repos side by side:  govi-isuru-ai-service\  govi-isuru-api\  govi-isuru-web\
# Without Docker you need MONGO_URI in govi-isuru-api\.env (e.g. a free MongoDB Atlas cluster).
param([switch]$Docker)
$ErrorActionPreference = 'Stop'

$Api = Resolve-Path (Join-Path $PSScriptRoot '..')
$Root = Split-Path $Api -Parent
$Ai = Join-Path $Root 'govi-isuru-ai-service'
$Web = Join-Path $Root 'govi-isuru-web'
$AiKey = 'local-ai-key'

Write-Host 'Govi Isuru local start' -ForegroundColor Green
foreach ($d in @($Ai, $Web)) {
  if (-not (Test-Path $d)) { Write-Host "Missing $d : clone it next to govi-isuru-api" -ForegroundColor Red; exit 1 }
}

# --- API environment ----------------------------------------------------------------------------------------
$envFile = Join-Path $Api '.env'
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $Api '.env.example') $envFile
  Write-Host 'Created govi-isuru-api\.env from .env.example: fill MONGO_URI and the secrets, then run again.' -ForegroundColor Yellow
  exit 1
}
$webEnv = Join-Path $Web '.env.local'
if (-not (Test-Path $webEnv)) { Set-Content -Encoding utf8 $webEnv "API_URL=http://localhost:5000`nNEXT_PUBLIC_API_URL=" }

# --- AI service bundle --------------------------------------------------------------------------------------
$bundle = Join-Path $Ai 'bundle'
if (-not (Test-Path (Join-Path $bundle 'decision.json'))) {
  Write-Host 'No AI bundle yet: building the development bundle (random weights; real yield/suitability).' -ForegroundColor Yellow
  Push-Location $Ai
  python scripts/make_dev_bundle.py --out bundle
  Pop-Location
}

if ($Docker) {
  $env:AI_SERVICE_KEY = $AiKey
  Push-Location $Api
  docker compose up --build -d
  docker compose ps
  Pop-Location
} else {
  $py = Join-Path $Ai '.venv\Scripts\python.exe'
  if (-not (Test-Path $py)) {
    Write-Host 'Creating the AI service virtual environment (first run only)...' -ForegroundColor Cyan
    Push-Location $Ai
    python -m venv .venv
    & $py -m pip install -q -e '.[service]'
    Pop-Location
  }
  Start-Process powershell -ArgumentList '-NoExit', '-Command', `
    "`$host.UI.RawUI.WindowTitle='Govi AI service :8000'; cd '$Ai\service'; `$env:GOVI_BUNDLE_DIR='$bundle'; `$env:GOVI_API_KEY='$AiKey'; `$env:GOVI_STATE_DIR='$Ai\state'; & '$py' -m uvicorn app.main:app --port 8000"

  if (-not (Test-Path (Join-Path $Api 'node_modules'))) { Push-Location $Api; npm install; Pop-Location }
  Start-Process powershell -ArgumentList '-NoExit', '-Command', `
    "`$host.UI.RawUI.WindowTitle='Govi API :5000'; cd '$Api'; `$env:AI_SERVICE_URL='http://localhost:8000'; `$env:AI_SERVICE_KEY='$AiKey'; npm run dev"
}

if (-not (Test-Path (Join-Path $Web 'node_modules'))) { Push-Location $Web; npm install; Pop-Location }
Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='Govi web :3000'; cd '$Web'; npm run dev"

Write-Host ''
Write-Host 'Started:' -ForegroundColor Green
Write-Host '  Web         http://localhost:3000'
Write-Host '  API         http://localhost:5000/health'
Write-Host '  AI service  http://localhost:8000/docs'
Write-Host 'The development AI bundle gives random diagnoses (marked dev_model); yield and suitability are real.'
