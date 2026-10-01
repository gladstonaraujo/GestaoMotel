#!/usr/bin/env bash
# ===========================================================================
# Backup diário do banco de dados. Gera um arquivo .backup dentro de
# deploy/backups, com a data no nome, e apaga backups com mais de 60 dias.
#
# Pra rodar sozinho todo dia, cadastre no cron do usuário que fez a
# instalação (não precisa ser root):
#   crontab -e
#   0 3 * * * /usr/bin/bash /caminho/completo/deploy/backup.sh
# (roda todo dia às 3h da manhã)
# ===========================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASTA_BACKUPS="$RAIZ/deploy/backups"
mkdir -p "$PASTA_BACKUPS"

SENHA_ARQUIVO="$RAIZ/deploy/.senha-postgres-gerada"
if [ ! -f "$SENHA_ARQUIVO" ]; then
  echo "Não achei a senha do Postgres (deploy/.senha-postgres-gerada). Rode instalar.sh primeiro." >&2
  exit 1
fi
export PGPASSWORD
PGPASSWORD="$(cat "$SENHA_ARQUIVO")"

DATA_HOJE="$(date +%Y-%m-%d_%H%M)"
ARQUIVO="$PASTA_BACKUPS/gestao_motel_$DATA_HOJE.backup"

pg_dump -U postgres -h 127.0.0.1 -F c -f "$ARQUIVO" gestao_motel
echo "Backup salvo em $ARQUIVO"

# apaga backups com mais de 60 dias pra não lotar o disco
find "$PASTA_BACKUPS" -name "gestao_motel_*.backup" -mtime +60 -delete
