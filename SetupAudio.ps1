$ErrorActionPreference = 'Stop'
$audioWork = Join-Path $PSScriptRoot 'work'
New-Item -ItemType Directory -Path $audioWork -Force | Out-Null
$audioZip = Join-Path $audioWork 'vgmstream-r2117-win64.zip'
Invoke-WebRequest 'https://github.com/vgmstream/vgmstream/releases/download/r2117/vgmstream-win64.zip' -OutFile $audioZip
$expectedHash = '6C4A8A3813864FEFED081BBD337DBC0AD93BF88E0B92F5DB98D7AB258B22DC6C'
if ((Get-FileHash -LiteralPath $audioZip -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Audio package checksum differs from the verified release.' }
Expand-Archive -LiteralPath $audioZip -DestinationPath (Join-Path $PSScriptRoot 'audio') -Force
Write-Host 'Audio decoder ready. Run Build.ps1 to include it in the app.'
