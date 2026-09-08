$ErrorActionPreference = 'Stop'
$deskUrl = 'http://127.0.0.1:3210'
New-Item -ItemType Directory -Force "$PSScriptRoot\data" | Out-Null
try { $deskResponse = Invoke-RestMethod "$deskUrl/api/state" -TimeoutSec 2 } catch { $deskResponse = $null }
if (-not $deskResponse) {
    Start-Process -FilePath (Get-Command node).Source -ArgumentList 'server.js' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput "$PSScriptRoot\data\server.log" -RedirectStandardError "$PSScriptRoot\data\server-error.log"
    for ($deskAttempt = 0; $deskAttempt -lt 20; $deskAttempt++) {
        Start-Sleep -Milliseconds 300
        try { $deskResponse = Invoke-RestMethod "$deskUrl/api/state" -TimeoutSec 1; break } catch {}
    }
}
if (-not $deskResponse) { throw 'Broadcast server did not start. Read data/server-error.log.' }
Start-Process $deskUrl
