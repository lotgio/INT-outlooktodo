$ErrorActionPreference = 'Stop'
$folder = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $folder 'config.js'))) {
  Copy-Item (Join-Path $folder 'config.example.js') (Join-Path $folder 'config.js')
  Write-Host 'Creato config.js: inserisci Client ID e Tenant ID in questo file, poi rilancia.' -ForegroundColor Yellow
  exit 0
}
Write-Host 'Server locale: http://localhost:8000' -ForegroundColor Cyan
Write-Host 'Interrompi con Ctrl+C.'
python -m http.server 8000 --directory $folder

