# start.ps1 - One-click startup for the Socket Chat Application
# Usage: .\start.ps1
# Starts: 1) Node.js TCP Chat Server (port 8080)
#         2) Node.js WebSocket Bridge  (port 3001)
#         3) React Dashboard dev server (port 5173, available on the LAN)

$Root    = $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Bridge  = Join-Path $Root "bridge"
$Dash    = Join-Path $Root "dashboard"
$LanIp   = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1 -ExpandProperty IPAddress
if (-not $LanIp) { $LanIp = "localhost" }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Socket Chat Application - Startup     " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. TCP Chat Server ────────────────────────────────────────────────────────
Write-Host "[1/3] Starting TCP Chat Server on port 8080..." -ForegroundColor Yellow
$serverProc = Start-Process node -ArgumentList "server.js", "8080" -WorkingDirectory $Backend -PassThru -WindowStyle Normal
Start-Sleep -Seconds 1
Write-Host "      PID: $($serverProc.Id)" -ForegroundColor Green

# ── 2. WebSocket Bridge ────────────────────────────────────────────────────────
Write-Host "[2/3] Starting WebSocket Bridge on port 3001..." -ForegroundColor Yellow
$bridgeProc = Start-Process node -ArgumentList "server.js" -WorkingDirectory $Bridge -PassThru -WindowStyle Normal
Start-Sleep -Seconds 1
Write-Host "      PID: $($bridgeProc.Id)" -ForegroundColor Green

# ── 3. React Dashboard ────────────────────────────────────────────────────────
Write-Host "[3/3] Starting React Dashboard on port 5173 (LAN enabled)..." -ForegroundColor Yellow
$dashProc = Start-Process node -ArgumentList "node_modules\vite\bin\vite.js", "--host", "0.0.0.0" -WorkingDirectory $Dash -PassThru -WindowStyle Normal
Start-Sleep -Seconds 2
Write-Host "      PID: $($dashProc.Id)" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  All services started!" -ForegroundColor Green
Write-Host ""
Write-Host "  This computer: http://localhost:5173" -ForegroundColor White
Write-Host "  Same network:  http://${LanIp}:5173" -ForegroundColor White
Write-Host ""
Write-Host "  Architecture:" -ForegroundColor White
Write-Host "    Browser  <-> WebSocket(3001) <-> TCP(8080)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Press Ctrl+C here, or close the server"
Write-Host "  windows individually to stop." -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Open the browser automatically
Start-Process "http://localhost:5173"

Write-Host "Services are running in separate console windows." -ForegroundColor Green
Write-Host "To stop all services, run .\stop.ps1" -ForegroundColor Yellow
