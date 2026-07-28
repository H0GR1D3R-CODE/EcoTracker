$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$pythonExe = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
$appFile = Join-Path $PSScriptRoot "app.py"

if (-not (Test-Path $pythonExe)) {
    throw "Python executable not found at $pythonExe"
}

if (-not (Test-Path $appFile)) {
    throw "Application entrypoint not found at $appFile"
}

& $pythonExe $appFile
