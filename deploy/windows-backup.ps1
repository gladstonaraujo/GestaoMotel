# ===========================================================================
# Backup diário do banco de dados. Gera um arquivo .backup dentro da pasta
# deploy\backups, com a data no nome, e apaga backups com mais de 60 dias.
#
# Pra rodar sozinho todo dia, cadastre esse script no Agendador de Tarefas do
# Windows (Task Scheduler): Criar Tarefa Básica > Diariamente, de madrugada >
# Ação: iniciar um programa > Programa: powershell.exe
# Argumentos: -ExecutionPolicy Bypass -File "CAMINHO\deploy\backup.ps1"
# ===========================================================================

$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$pastaBackups = Join-Path $PSScriptRoot 'backups'
New-Item -ItemType Directory -Force -Path $pastaBackups | Out-Null

$pgBin = "C:\Program Files\PostgreSQL\17\bin"
$senhaMarcador = Join-Path $PSScriptRoot '.senha-postgres-gerada'
if (-not (Test-Path $senhaMarcador)) {
    Write-Host "Não achei a senha do Postgres (deploy\.senha-postgres-gerada). Rode instalar.ps1 primeiro." -ForegroundColor Red
    exit 1
}
$env:PGPASSWORD = Get-Content $senhaMarcador -Raw

$dataHoje = Get-Date -Format 'yyyy-MM-dd_HHmm'
$arquivo = Join-Path $pastaBackups "gestao_motel_$dataHoje.backup"

& "$pgBin\pg_dump.exe" -U postgres -h 127.0.0.1 -F c -f $arquivo gestao_motel
Write-Host "Backup salvo em $arquivo"

# apaga backups com mais de 60 dias pra não lotar o disco
Get-ChildItem $pastaBackups -Filter "gestao_motel_*.backup" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-60) } |
    Remove-Item -Force
