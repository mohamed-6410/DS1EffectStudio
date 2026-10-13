@echo off
powershell.exe -NoProfile -Command "try { $null = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:5187/api/shutdown'; Write-Host 'DS1 Effect Studio stopped.' } catch { Write-Host 'DS1 Effect Studio is not running.' }"
