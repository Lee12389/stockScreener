param(
  [ValidateSet('web', 'android', 'ios')]
  [string]$Target = 'web'
)

Push-Location 'client'
try {
  if (!(Test-Path 'node_modules')) {
    npm install
  }

  switch ($Target) {
    'android' { npm run android }
    'ios' { npm run ios }
    default { npm run web }
  }
}
finally {
  Pop-Location
}
