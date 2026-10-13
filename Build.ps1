$ErrorActionPreference = 'Stop'
dotnet publish (Join-Path $PSScriptRoot 'DS1EffectStudio.csproj') -c Release -r win-x64 --self-contained true -o (Join-Path $PSScriptRoot 'app') -p:NuGetAudit=false -p:WarningLevel=0
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

dotnet publish (Join-Path $PSScriptRoot "desktop/DS1EffectStudio.Desktop.csproj") -c Release -r win-x64 --self-contained true -o (Join-Path $PSScriptRoot "desktop-app") -p:NuGetAudit=false
if ($LASTEXITCODE -ne 0) { throw "Desktop build failed." }
