param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$python = if (Test-Path '.\.venv\Scripts\python.exe') {
  '.\.venv\Scripts\python.exe'
} else {
  'python'
}

& $python 'scripts/cleanup.py' @Args
exit $LASTEXITCODE
