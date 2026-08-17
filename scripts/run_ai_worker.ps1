# run_ai_worker.ps1
# Dispara el análisis predictivo diario del dashboard Girasol.
# Lee CRON_SECRET desde .env.local (no hardcodea el secreto) y llama al endpoint del cron.
# Pensado para ejecutarse cada noche vía Windows Task Scheduler.

$ErrorActionPreference = "Stop"

# Raíz del proyecto = carpeta padre de este script (scripts\)
$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env.local"
$port = if ($env:GIRASOL_PORT) { $env:GIRASOL_PORT } else { "3000" }

if (-not (Test-Path $envFile)) {
    Write-Error "No se encontró .env.local en $projectRoot. Crea el archivo con CRON_SECRET=..."
    exit 1
}

# Extraer CRON_SECRET del .env.local
$secret = $null
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*CRON_SECRET\s*=\s*(.+?)\s*$') {
        $secret = $matches[1]
        break
    }
}

if ([string]::IsNullOrWhiteSpace($secret)) {
    Write-Error "CRON_SECRET no está definido en .env.local"
    exit 1
}

$url = "http://localhost:$port/api/cron/ai-worker?key=$secret"
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

try {
    $resp = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 1800
    Write-Output "[$stamp] AI Worker OK -> modo=$($resp.mode) analizadas=$($resp.analyzed) duracion=$($resp.duration_seconds)s"
}
catch {
    Write-Output "[$stamp] AI Worker FALLO: $($_.Exception.Message)"
    exit 1
}
