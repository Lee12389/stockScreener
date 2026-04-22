param(
  [ValidateSet('web', 'android', 'ios')]
  [string]$Target = 'web'
)

function Resolve-JavaHome {
  $candidates = @()

  if (Test-Path 'C:\Program Files\Eclipse Adoptium') {
    $candidates += Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory |
      Sort-Object Name -Descending |
      Select-Object -ExpandProperty FullName
  }

  $candidates += @(
    $env:JAVA_HOME,
    'C:\Program Files\Android\Android Studio\jbr'
  )

  return $candidates |
    Where-Object { $_ -and (Test-Path (Join-Path $_ 'bin\javac.exe')) } |
    Select-Object -First 1
}

function Resolve-AndroidSdk {
  $candidates = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
  ) | Where-Object { $_ -and (Test-Path $_) }

  return $candidates | Select-Object -First 1
}

Push-Location 'client'
try {
  if (!(Test-Path 'node_modules')) {
    npm install
    if ($LASTEXITCODE -ne 0) {
      throw 'npm install failed for the Expo client.'
    }
  }

  switch ($Target) {
    'android' {
      $sdkRoot = Resolve-AndroidSdk
      if (-not $sdkRoot) {
        throw 'Android SDK not found. Install Android Studio or the Android SDK, then rerun this script.'
      }

      $javaHome = Resolve-JavaHome
      if (-not $javaHome) {
        throw 'A JDK was not found. Install Eclipse Temurin or Android Studio, then rerun this script.'
      }

      $env:ANDROID_HOME = $sdkRoot
      $env:ANDROID_SDK_ROOT = $sdkRoot
      $env:JAVA_HOME = $javaHome

      npm run android
      if ($LASTEXITCODE -ne 0) {
        throw 'Android client launch failed.'
      }
    }
    'ios' {
      throw 'Local iOS runs require macOS and Xcode. Use the web target here, or build iOS from a Mac/EAS Build.'
    }
    default {
      npm run web
      if ($LASTEXITCODE -ne 0) {
        throw 'Web client launch failed.'
      }
    }
  }
}
finally {
  Pop-Location
}
