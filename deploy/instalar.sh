#!/usr/bin/env bash
# ===========================================================================
# Instalação do sistema de Gestão Financeira A2 num computador novo
# (Ubuntu/Debian). Rode via SSH, com sudo.
#
#   sudo bash deploy/instalar.sh
#
# O que ele faz, em ordem:
#   1. Instala Node.js e PostgreSQL (se ainda não tiver)
#   2. Cria o banco de dados e as tabelas
#   3. Gera as senhas/chaves de segurança (.env)
#   4. Instala as dependências do back-end
#   5. Registra o sistema como serviço do systemd (liga sozinho com a
#      máquina, reinicia sozinho se cair)
#   6. Libera a porta no firewall (ufw), se estiver ativo
#
# É seguro rodar de novo se algo der errado no meio — ele pula passos que já
# foram feitos.
# ===========================================================================
set -euo pipefail

titulo(){ echo -e "\n\033[1;36m=== $1 ===\033[0m"; }

if [ "$EUID" -ne 0 ]; then
  echo "Rode com sudo: sudo bash deploy/instalar.sh" >&2
  exit 1
fi

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$RAIZ/backend"
DATABASE="$RAIZ/database"
# usuário "dono" da instalação (quem chamou o sudo) — o serviço roda como ele,
# não como root, por segurança
USUARIO_APP="${SUDO_USER:-$(whoami)}"
echo "Pasta do projeto: $RAIZ"
echo "Serviço vai rodar como usuário: $USUARIO_APP"

# ---- 1. Node.js ----
titulo "Node.js"
if command -v node >/dev/null 2>&1; then
  echo "Já instalado: $(node -v)"
else
  echo "Instalando Node.js (LTS)..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
fi

# ---- 2. PostgreSQL ----
titulo "PostgreSQL"
if command -v psql >/dev/null 2>&1; then
  echo "Já instalado."
else
  echo "Instalando PostgreSQL..."
  apt-get update
  apt-get install -y postgresql postgresql-contrib
fi
systemctl enable postgresql --now

# ---- 3. Senha do superusuário do Postgres + banco de dados ----
titulo "Banco de dados"
SENHA_ARQUIVO="$RAIZ/deploy/.senha-postgres-gerada"
if [ -f "$SENHA_ARQUIVO" ]; then
  SENHA_PG="$(cat "$SENHA_ARQUIVO")"
  echo "Senha do Postgres já tinha sido gerada antes, reaproveitando."
else
  echo "Gerando senha nova do Postgres..."
  # o "|| true" evita que o script pare (set -e + pipefail) quando o head corta o pipe
  # do urandom/tr antes dele terminar de escrever (gera SIGPIPE, exit code != 0)
  SENHA_PG="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24 || true)"
  # no Linux o usuário do sistema "postgres" já autentica localmente sem
  # senha (peer auth) — não precisa da dança de editar pg_hba.conf
  sudo -u postgres psql -c "ALTER USER postgres PASSWORD '$SENHA_PG';" >/dev/null
  echo -n "$SENHA_PG" > "$SENHA_ARQUIVO"
  chmod 600 "$SENHA_ARQUIVO"
  echo "Senha definida e guardada em deploy/.senha-postgres-gerada (não apague nem suba pra lugar nenhum)."
fi

BANCO_EXISTE=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='gestao_motel'")
if [ "$BANCO_EXISTE" = "1" ]; then
  echo "Banco 'gestao_motel' já existe."
else
  echo "Criando banco 'gestao_motel'..."
  sudo -u postgres psql -c "CREATE DATABASE gestao_motel;" >/dev/null
fi

TABELA_EXISTE=$(sudo -u postgres psql -d gestao_motel -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='usuarios'")
if [ "$TABELA_EXISTE" = "1" ]; then
  echo "Tabelas já existem, pulando schema.sql."
else
  echo "Criando as tabelas (schema.sql)..."
  # usa "<" em vez de "-f": o redirecionamento abre o arquivo como root (que sempre
  # pode ler), evitando erro de permissão quando o usuário "postgres" não consegue
  # atravessar a pasta home de quem extraiu o projeto (ex: /home/usuario com modo 750)
  sudo -u postgres psql -d gestao_motel < "$DATABASE/schema.sql" >/dev/null
fi

# ---- 4. Arquivo .env ----
titulo "Configuração (.env)"
ENV_PATH="$BACKEND/.env"
if [ -f "$ENV_PATH" ]; then
  echo "Já existe um .env, não vou sobrescrever."
else
  JWT_SECRET="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48 || true)"
  cat > "$ENV_PATH" <<EOF
DATABASE_URL=postgres://postgres:$SENHA_PG@127.0.0.1:5432/gestao_motel
JWT_SECRET=$JWT_SECRET
PORT=3001
CORS_ORIGIN=*
EOF
  echo "Arquivo .env criado."
fi

# ---- 5. Dependências e usuário inicial ----
titulo "Instalando dependências (npm install)"
(cd "$BACKEND" && npm install --no-fund --no-audit && npm run build)

TEM_USUARIO=$(sudo -u postgres psql -d gestao_motel -tAc "SELECT 1 FROM usuarios WHERE login='diretor'")
if [ "$TEM_USUARIO" = "1" ]; then
  echo "Usuário 'diretor' já existe, pulando seed.js."
else
  echo "Criando o usuário 'diretor' (senha inicial: 123 — troque assim que entrar!)..."
  (cd "$BACKEND" && node seed.js)
fi

# dono dos arquivos volta a ser o usuário normal, não root (importante pro
# node conseguir escrever em backend/uploads quando o serviço rodar como ele)
chown -R "$USUARIO_APP":"$USUARIO_APP" "$RAIZ"

# ---- 6. Serviço do systemd (liga sozinho, reinicia sozinho) ----
titulo "Serviço do systemd"
NODE_BIN="$(command -v node)"
cat > /etc/systemd/system/gestaomotel.service <<EOF
[Unit]
Description=Gestao Financeira A2 - Rede de Moteis
After=network.target postgresql.service

[Service]
Type=simple
User=$USUARIO_APP
WorkingDirectory=$BACKEND
ExecStart=$NODE_BIN dist/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gestaomotel
systemctl restart gestaomotel

# ---- 7. Firewall (libera acesso de outros dispositivos da rede) ----
titulo "Firewall"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 3001/tcp >/dev/null
  echo "Porta 3001 liberada no ufw."
else
  echo "ufw não está ativo (ou não instalado) — nenhuma regra de firewall bloqueando, nada a fazer."
fi

# ---- Resumo final ----
titulo "Pronto!"
sleep 2
IP=$(hostname -I | awk '{print $1}')
echo ""
if systemctl is-active --quiet gestaomotel; then
  echo -e "\033[1;32mSistema rodando como serviço do systemd (liga sozinho com a máquina).\033[0m"
else
  echo -e "\033[1;31mO serviço não subiu — rode: journalctl -u gestaomotel -n 50\033[0m"
fi
echo ""
echo "Neste computador, acesse:                              http://localhost:3001"
echo "De outros computadores/tablets da mesma rede, acesse:  http://$IP:3001"
echo ""
echo -e "\033[1;33mLogin inicial: diretor / senha: 123 — troque a senha assim que entrar!\033[0m"
echo ""
echo -e "\033[2mDica: deixe o IP acima fixo no roteador (reserva de DHCP), senão ele pode\033[0m"
echo -e "\033[2mmudar e os atalhos salvos nos outros dispositivos param de funcionar.\033[0m"
