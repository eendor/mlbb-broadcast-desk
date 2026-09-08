$deskRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$deskListener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue
foreach ($deskEntry in $deskListener) {
    $deskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($deskEntry.OwningProcess)"
    if ($deskProcess.Name -eq 'node.exe' -and $deskProcess.CommandLine -match 'server\.js') {
        Stop-Process -Id $deskEntry.OwningProcess
        Write-Host 'Broadcast server stopped. OBS sources are now offline.'
    }
}
