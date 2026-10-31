# stop.ps1 - Stop all Socket Chat Application services
Write-Host "Stopping all chat services..." -ForegroundColor Yellow

# Kill node processes on known ports
$ports = @(8080, 3001, 5173)
foreach ($port in $ports) {
    $procs = netstat -aon | Select-String ":$port " | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Select-Object -Unique
    foreach ($procId in $procs) {
        if ($procId -match '^\d+$' -and $procId -ne '0') {
            try {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                Write-Host "  Stopped PID $procId (port $port)" -ForegroundColor Green
            } catch {}
        }
    }
}

Write-Host "Done." -ForegroundColor Green
