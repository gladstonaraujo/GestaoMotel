<#
.SYNOPSIS
  Gera o build, envia ao servidor e atualiza o sistema, aplicando as migrações
  do banco que ainda não rodaram.

.DESCRIPTION
  Roda no seu computador (Windows), na raiz do projeto ou de qualquer lugar:
    1. Confere se não há alterações sem commit (use -PermitirAlteracoes para ignorar)
    2. Roda os testes e o build (backend/dist e frontend/dist)
    3. Monta um pacote .tar.gz com backend, frontend, database, deploy e os dist
       (sem .env, uploads, node_modules nem backups)
    4. Envia o pacote por scp e roda deploy/atualizar.sh no servidor, que faz o
       backup do banco, aplica as migrações pendentes, troca os arquivos,
       reinicia o serviço e confere se ele subiu (se não subir, volta a versão
       anterior sozinho)

  Com uma chave SSH configurada para o usuário do servidor, só a senha do sudo
  (para reiniciar o serviço) é pedida.

.EXAMPLE
  .\deploy\atualizar-servidor.ps1

.EXAMPLE
  .\deploy\atualizar-servidor.ps1 -Servidor motel
  (usando um "Host motel" do ~/.ssh/config)
#>
param(
  [string]$Servidor = 'anderson@38.246.78.129',
  [int]$Porta = 4123,
  [string]$Pasta = '/home/anderson/GestaoMotel',
  [switch]$PularTestes,
  [switch]$PermitirAlteracoes,
  [switch]$Sim
)

$ErrorActionPreference = 'Stop'
$Raiz = Split-Path $PSScriptRoot -Parent

function Titulo($texto) { Write-Host "`n=== $texto ===" -ForegroundColor Cyan }
function Executar([string]$Programa, [string[]]$Argumentos) {
  & $Programa @Argumentos
  if ($LASTEXITCODE -ne 0) { throw "Falhou ($LASTEXITCODE): $Programa $($Argumentos -join ' ')" }
}
function Confirmar([string]$Pergunta) {
  if ($Sim) { return }
  $r = Read-Host "$Pergunta (s/N)"
  if ($r -notmatch '^(s|sim)$') { throw 'Cancelado.' }
}

$tar = Join-Path $env:SystemRoot 'System32\tar.exe'
if (-not (Test-Path $tar)) { $tar = 'tar' }
foreach ($cmd in 'git', 'npm', 'ssh', 'scp') {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Comando '$cmd' não encontrado." }
}

$carimbo = Get-Date -Format 'yyyyMMdd-HHmmss'
$temp = [IO.Path]::GetTempPath()
$staging = Join-Path $temp "gestaomotel-$carimbo"
$pacoteNome = "gestaomotel-$carimbo.tar.gz"
$pacote = Join-Path $temp $pacoteNome
$scriptNome = "gestaomotel-atualizar-$carimbo.sh"
$scriptLocal = Join-Path $temp $scriptNome

Push-Location $Raiz
try {
  # ---- 1. Git ----
  Titulo 'Conferindo o código'
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  $commit = (git rev-parse --short HEAD).Trim()
  $alteracoes = git status --porcelain
  if ($alteracoes) {
    if (-not $PermitirAlteracoes) {
      Write-Host ($alteracoes -join "`n")
      throw 'Há alterações sem commit. Faça o commit antes ou rode com -PermitirAlteracoes.'
    }
    Write-Host 'Atenção: há alterações sem commit, e elas vão junto.' -ForegroundColor Yellow
  }
  Write-Host "Branch: $branch   Commit: $commit"
  if ($branch -ne 'master') {
    Write-Host "Atenção: você não está na master (está em '$branch')." -ForegroundColor Yellow
  }
  Write-Host "Destino: ${Servidor}:$Pasta (porta $Porta)"
  Confirmar 'Publicar esta versão no servidor?'

  # ---- 2. Testes e build ----
  Push-Location backend
  try {
    if (-not (Test-Path node_modules)) { Titulo 'npm install'; Executar npm @('install', '--no-fund', '--no-audit') }
    if (-not $PularTestes) { Titulo 'Testes'; Executar npm @('test') }
    Titulo 'Build'
    Executar npm @('run', 'build')
  } finally { Pop-Location }

  # ---- 3. Pacote ----
  Titulo 'Montando o pacote'
  New-Item -ItemType Directory -Force $staging | Out-Null
  $arquivos = git -c core.quotepath=off ls-files -co --exclude-standard -- backend frontend database deploy
  foreach ($a in $arquivos) {
    if ($a -match '^deploy/(backups|versoes-anteriores)/' -or $a -match '\.senha-postgres-gerada$') { continue }
    if (-not (Test-Path -LiteralPath $a -PathType Leaf)) { continue }  # apagado e ainda não commitado
    $destino = Join-Path $staging $a
    New-Item -ItemType Directory -Force (Split-Path $destino) | Out-Null
    Copy-Item -LiteralPath $a $destino
  }
  Copy-Item backend\dist (Join-Path $staging 'backend\dist') -Recurse
  Copy-Item frontend\dist (Join-Path $staging 'frontend\dist') -Recurse

  $versao = "commit $commit ($branch)`ngerado em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  if ($alteracoes) { $versao += "`ncom alterações sem commit" }
  [IO.File]::WriteAllText((Join-Path $staging 'VERSAO'), "$versao`n", [Text.UTF8Encoding]::new($false))

  Executar $tar @('-czf', $pacote, '-C', $staging, '.')
  Copy-Item (Join-Path $staging 'deploy\atualizar.sh') $scriptLocal
  Write-Host ("Pacote: {0:N1} MB" -f ((Get-Item $pacote).Length / 1MB))

  # ---- 4. Envio e atualização ----
  Titulo 'Enviando para o servidor'
  Executar scp @('-P', "$Porta", $pacote, $scriptLocal, "${Servidor}:/tmp/")

  Titulo 'Atualizando no servidor'
  $remoto = "sed -i 's/\r`$//' /tmp/$scriptNome && bash /tmp/$scriptNome /tmp/$pacoteNome '$Pasta'; s=`$?; rm -f /tmp/$scriptNome /tmp/$pacoteNome; exit `$s"
  Executar ssh @('-t', '-p', "$Porta", $Servidor, $remoto)

  Write-Host "`nPronto: versão $commit publicada." -ForegroundColor Green
}
finally {
  Pop-Location
  Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue
  Remove-Item -Force $pacote, $scriptLocal -ErrorAction SilentlyContinue
}
