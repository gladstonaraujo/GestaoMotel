# ===========================================================================
# Instalação do sistema de Gestão Financeira A2 num computador novo (Windows).
#
# Rode este script no PowerShell COMO ADMINISTRADOR, no computador que vai
# ficar ligado o dia todo rodando o sistema (o "servidor" da unidade).
#
# O que ele faz, em ordem:
#   1. Instala Node.js e PostgreSQL (se ainda não tiver)
#   2. Cria o banco de dados e as tabelas
#   3. Gera as senhas/chaves de segurança (.env)
#   4. Instala as dependências do back-end
#   5. Registra o sistema como um Serviço do Windows (liga sozinho com o PC,
#      reinicia sozinho se cair)
#   6. Libera o Firewall do Windows pra outros computadores da rede acessarem
#
# É seguro rodar de novo se algo der errado no meio — ele pula passos que já
# foram feitos.
# ===========================================================================

$ErrorActionPreference = 'Stop'

function Titulo($texto) {
    Write-Host ""
    Write-Host "=== $texto ===" -ForegroundColor Cyan
}

# ---- 0. Confere se está rodando como Administrador ----
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Write-Host "Feche esta janela e abra o PowerShell como Administrador (botão direito > Executar como administrador)." -ForegroundColor Red
    exit 1
}

$raiz = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $raiz 'backend'
$database = Join-Path $raiz 'database'
Write-Host "Pasta do projeto: $raiz"

# ---- 1. Node.js ----
Titulo "Node.js"
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "Já instalado: $(node -v)"
} else {
    Write-Host "Instalando Node.js (LTS)..."
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    $env:PATH += ";C:\Program Files\nodejs"
}

# ---- 2. PostgreSQL ----
Titulo "PostgreSQL"
$pgBin = "C:\Program Files\PostgreSQL\17\bin"
$servicoPg = Get-Service -Name "postgresql-x64-17" -ErrorAction SilentlyContinue
if ($servicoPg) {
    Write-Host "Já instalado."
} else {
    Write-Host "Instalando PostgreSQL 17..."
    winget install -e --id PostgreSQL.PostgreSQL.17 --accept-source-agreements --accept-package-agreements
    Start-Sleep -Seconds 5
    $servicoPg = Get-Service -Name "postgresql-x64-17"
}
if ($servicoPg.Status -ne 'Running') { Start-Service $servicoPg }
$env:PATH += ";$pgBin"

# ---- 3. Senha do superusuário do Postgres + banco de dados ----
Titulo "Banco de dados"
$pgHba = "C:\Program Files\PostgreSQL\17\data\pg_hba.conf"
$senhaMarcador = Join-Path $raiz 'deploy\.senha-postgres-gerada'

if (Test-Path $senhaMarcador) {
    $senhaPg = Get-Content $senhaMarcador -Raw
    Write-Host "Senha do Postgres já tinha sido gerada antes, reaproveitando."
} else {
    Write-Host "Gerando senha nova do Postgres e configurando o acesso..."
    $senhaPg = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})

    Stop-Service postgresql-x64-17 -Force
    Copy-Item $pgHba "$pgHba.bak" -Force
    try {
        (Get-Content $pgHba) -replace 'scram-sha-256', 'trust' | Set-Content $pgHba
        Start-Service postgresql-x64-17
        Start-Sleep -Seconds 2
        & "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER USER postgres PASSWORD '$senhaPg';" | Out-Null
    } finally {
        # sempre restaura a autenticação segura, mesmo se o psql acima falhar —
        # senão o banco fica com acesso livre (trust) sem ninguém perceber
        Copy-Item "$pgHba.bak" $pgHba -Force
        Remove-Item "$pgHba.bak"
        Restart-Service postgresql-x64-17
        Start-Sleep -Seconds 2
    }

    Set-Content -Path $senhaMarcador -Value $senhaPg -NoNewline
    Write-Host "Senha do Postgres definida e guardada em deploy\.senha-postgres-gerada (não apague esse arquivo nem suba ele pra lugar nenhum)."
}

$env:PGPASSWORD = $senhaPg
$bancoExiste = & "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -tAc "SELECT 1 FROM pg_database WHERE datname='gestao_motel'"
if ($bancoExiste -match '1') {
    Write-Host "Banco 'gestao_motel' já existe."
} else {
    Write-Host "Criando banco 'gestao_motel'..."
    & "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -c "CREATE DATABASE gestao_motel;" | Out-Null
}

$tabelaExiste = & "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -d gestao_motel -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='usuarios'"
if ($tabelaExiste -match '1') {
    Write-Host "Tabelas já existem, pulando schema.sql."
} else {
    Write-Host "Criando as tabelas (schema.sql)..."
    & "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -d gestao_motel -f (Join-Path $database 'schema.sql') | Out-Null
}

# ---- 4. Arquivo .env ----
Titulo "Configuração (.env)"
$envPath = Join-Path $backend '.env'
if (Test-Path $envPath) {
    Write-Host "Já existe um .env, não vou sobrescrever."
} else {
    $jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
    @"
DATABASE_URL=postgres://postgres:$senhaPg@127.0.0.1:5432/gestao_motel
JWT_SECRET=$jwtSecret
PORT=3001
CORS_ORIGIN=*
"@ | Set-Content -Path $envPath -Encoding UTF8
    Write-Host "Arquivo .env criado."
}

# ---- 5. Dependências e usuário inicial ----
Titulo "Instalando dependências (npm install)"
Push-Location $backend
npm install --no-fund --no-audit
npm run build

$temUsuario = & "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -d gestao_motel -tAc "SELECT 1 FROM usuarios WHERE login='diretor'"
if ($temUsuario -match '1') {
    Write-Host "Usuário 'diretor' já existe, pulando seed.js."
} else {
    Write-Host "Criando o usuário 'diretor' (senha inicial: 123 — troque assim que entrar!)..."
    node seed.js
}
Pop-Location

# ---- 6. Serviço do Windows (liga sozinho, reinicia sozinho) ----
Titulo "Serviço do Windows"
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
    Write-Host "Instalando NSSM (gerenciador de serviço)..."
    winget install -e --id NSSM.NSSM --accept-source-agreements --accept-package-agreements
    $env:PATH += ";C:\Program Files\nssm"
}

$nomeServico = "GestaoMotel"
$servicoExistente = Get-Service -Name $nomeServico -ErrorAction SilentlyContinue
$nodeExe = (Get-Command node).Source
if ($servicoExistente) {
    Write-Host "Serviço '$nomeServico' já existe. Reiniciando..."
    Restart-Service $nomeServico
} else {
    Write-Host "Criando o serviço '$nomeServico'..."
    nssm install $nomeServico $nodeExe "dist\server.js"
    nssm set $nomeServico AppDirectory $backend
    nssm set $nomeServico AppStdout (Join-Path $backend 'servico.log')
    nssm set $nomeServico AppStderr (Join-Path $backend 'servico-erro.log')
    nssm set $nomeServico Start SERVICE_AUTO_START
    nssm set $nomeServico AppExit Default Restart
    Start-Service $nomeServico
}

# ---- 7. Firewall (libera acesso de outros dispositivos da rede) ----
Titulo "Firewall do Windows"
$regraExiste = Get-NetFirewallRule -DisplayName "Gestao Motel" -ErrorAction SilentlyContinue
if ($regraExiste) {
    Write-Host "Regra de firewall já existe."
} else {
    New-NetFirewallRule -DisplayName "Gestao Motel" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow | Out-Null
    Write-Host "Porta 3001 liberada no firewall."
}

# ---- Resumo final ----
Titulo "Pronto!"
Start-Sleep -Seconds 2
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress
Write-Host ""
Write-Host "Sistema rodando como serviço do Windows (liga sozinho com o PC)." -ForegroundColor Green
Write-Host ""
Write-Host "Neste computador, acesse:      http://localhost:3001"
Write-Host "De outros computadores/tablets da mesma rede, acesse:  http://$ip:3001"
Write-Host ""
Write-Host "Login inicial: diretor / senha: 123 — troque a senha assim que entrar!" -ForegroundColor Yellow
Write-Host ""
Write-Host "Dica: deixe o IP acima fixo no roteador (reserva de DHCP), senão ele pode" -ForegroundColor DarkGray
Write-Host "mudar e os atalhos salvos nos outros dispositivos param de funcionar." -ForegroundColor DarkGray
