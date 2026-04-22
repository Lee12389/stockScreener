param(
  [string]$Host = '127.0.0.1',
  [int]$Port = 5015
)

if (!(Test-Path '.venv')) {
  python -m venv .venv
}

.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\uvicorn app.main:app --host $Host --port $Port --reload
