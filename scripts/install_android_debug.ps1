param(
  [switch]$SkipPrebuild,
  [switch]$NoInstall
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

$repoRoot = Split-Path -Parent $PSScriptRoot
$clientDir = Join-Path $repoRoot 'client'
$sdkRoot = Resolve-AndroidSdk
$javaHome = Resolve-JavaHome

if (-not $sdkRoot) {
  throw 'Android SDK not found. Install Android Studio or the Android SDK, then rerun this script.'
}

if (-not $javaHome) {
  throw 'A JDK was not found. Install Eclipse Temurin or Android Studio, then rerun this script.'
}

$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:JAVA_HOME = $javaHome
$env:NODE_ENV = 'development'

$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'

Push-Location $clientDir
try {
  if (!(Test-Path 'node_modules')) {
    npm install
    if ($LASTEXITCODE -ne 0) {
      throw 'npm install failed for the Expo client.'
    }
  }

  if (-not $SkipPrebuild) {
    npx expo prebuild --platform android --clean
    if ($LASTEXITCODE -ne 0) {
      throw 'Expo Android prebuild failed.'
    }
  }

  Push-Location 'android'
  try {
    .\gradlew.bat app:assembleDebug
    if ($LASTEXITCODE -ne 0) {
      throw 'Gradle failed to assemble the Android debug APK.'
    }
  }
  finally {
    Pop-Location
  }

  $apkPath = Join-Path $clientDir 'android\app\build\outputs\apk\debug\app-debug.apk'
  if (!(Test-Path $apkPath)) {
    throw "APK not found at $apkPath"
  }

  if ($NoInstall) {
    Write-Host "Built debug APK at $apkPath"
    return
  }

  if (!(Test-Path $adb)) {
    throw 'adb.exe was not found under the Android SDK platform-tools directory.'
  }

  $deviceLines = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\bdevice$' }
  if (-not $deviceLines) {
    Write-Warning 'No Android device detected. Connect a phone with USB debugging enabled, or rerun with -NoInstall to only build the APK.'
    Write-Host "Built debug APK at $apkPath"
    return
  }

  & $adb install -r $apkPath
  if ($LASTEXITCODE -ne 0) {
    throw 'adb failed to install the debug APK.'
  }
}
finally {
  Pop-Location
}
