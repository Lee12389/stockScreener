param(
  [string]$Host = '127.0.0.1',
  [int]$Port = 5015
)

$repoRoot = Split-Path -Parent $PSScriptRoot

if (!(Test-Path (Join-Path $repoRoot '.venv'))) {
  Push-Location $repoRoot
  try {
    python -m venv .venv
  }
  finally {
    Pop-Location
  }
}

Push-Location $repoRoot
try {
  .\.venv\Scripts\python -m pip install -r requirements.txt

  Push-Location client
  try {
    if (!(Test-Path 'node_modules')) {
      npm install
      if ($LASTEXITCODE -ne 0) {
        throw 'npm install failed for the Expo client.'
      }
    }

    npm run export:web
    if ($LASTEXITCODE -ne 0) {
      throw 'Expo web export failed.'
    }
  }
  finally {
    Pop-Location
  }

  $env:WEB_DIST_DIR = Join-Path $repoRoot 'client\dist'
  if (-not $env:INTERNAL_API_BASE_URL) {
    $env:INTERNAL_API_BASE_URL = 'http://127.0.0.1:1516'
  }

  .\.venv\Scripts\uvicorn app.public_gateway:app --host $Host --port $Port --reload
}
finally {
  Pop-Location
}
