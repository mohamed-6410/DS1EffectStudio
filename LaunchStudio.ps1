param([string]$GameData = 'E:\Games\Dark Souls Prepare to Die Edition\DATA', [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$studioUrl = 'http://127.0.0.1:5187'
try { $studioHealth = Invoke-RestMethod "$studioUrl/api/health" -TimeoutSec 2 } catch { $studioHealth = $null }
if (-not $studioHealth.ready) {
    $studioApp = Join-Path $PSScriptRoot 'app\DS1EffectStudio.exe'
    if (-not (Test-Path -LiteralPath $studioApp)) { throw 'The app folder is missing. Extract the entire download before launching.' }
    $studioArgs = '--game "' + $GameData + '"'
    $studioProcess = Start-Process -FilePath $studioApp -ArgumentList $studioArgs -WorkingDirectory (Split-Path $studioApp) -WindowStyle Hidden -PassThru
    for ($studioAttempt = 0; $studioAttempt -lt 40; $studioAttempt++) {
        if ($studioProcess.HasExited) { throw 'The viewer could not load this installation. Check the DATA path and its sfx folder.' }
        try { $studioHealth = Invoke-RestMethod "$studioUrl/api/health" -TimeoutSec 1; if ($studioHealth.ready) { break } } catch {}
        Start-Sleep -Milliseconds 250
    }
    if (-not $studioHealth.ready) { throw 'The viewer did not finish starting. Try launching app\DS1EffectStudio.exe directly to see the error.' }
}
if (-not $NoBrowser) { Start-Process $studioUrl }
Write-Host "DS1 Effect Studio is ready at $studioUrl"
