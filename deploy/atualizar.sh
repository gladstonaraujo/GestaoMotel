#!/usr/bin/env bash
# ===========================================================================
# Atualiza, no servidor, um sistema JÁ INSTALADO a partir do pacote gerado
# pelo deploy/atualizar-servidor.ps1 (que envia este script e o chama
# sozinho). Normalmente você não roda este arquivo à mão.
#
#   bash atualizar.sh <pacote.tar.gz> [pasta-do-sistema]
#
# Rode como o usuário dono da instalação (o mesmo do serviço, ex: anderson).
# O que ele faz, em ordem:
#   1. Confere o pacote e a instalação
#   2. Faz backup do banco (deploy/backups/gestao_motel_antes-atualizacao_*.backup)
#   3. Aplica as migrações de database/migracoes/ que ainda não rodaram
#      (controladas pela tabela migracoes_aplicadas)
#   4. Guarda a versão atual (deploy/versoes-anteriores/, mantém as 3 últimas)
#   5. Copia os arquivos novos (não mexe em .env, uploads, node_modules,
#      backups nem na senha do Postgres)
#   6. Roda npm install se as dependências mudaram
#   7. Reinicia o serviço e confere /api/saude — se não subir, volta os
#      arquivos da versão anterior sozinho
# ===========================================================================
set -euo pipefail

titulo(){ echo -e "\n\033[1;36m=== $1 ===\033[0m"; }
ok(){ echo -e "\033[1;32m$1\033[0m"; }
aviso(){ echo -e "\033[1;33m$1\033[0m"; }
erro(){ echo -e "\033[1;31m$1\033[0m" >&2; }

PACOTE="${1:?Uso: bash atualizar.sh <pacote.tar.gz> [pasta-do-sistema]}"
RAIZ="${2:-$HOME/GestaoMotel}"
SERVICO="gestaomotel"
BACKEND="$RAIZ/backend"
FRONTEND="$RAIZ/frontend"
ENV_PATH="$BACKEND/.env"
CARIMBO="$(date +%Y-%m-%d_%H%M%S)"

# ---- 1. Conferências ----
titulo "Conferindo"
[ -f "$PACOTE" ]   || { erro "Pacote não encontrado: $PACOTE"; exit 1; }
[ -f "$ENV_PATH" ] || { erro "Não achei $ENV_PATH — o sistema está instalado em $RAIZ?"; exit 1; }

DONO="$(stat -c %U "$BACKEND")"
if [ "$(id -un)" != "$DONO" ]; then
  erro "Rode como o usuário '$DONO' (dono de $RAIZ), não como '$(id -un)'."
  exit 1
fi

for cmd in psql pg_dump tar npm node; do
  command -v "$cmd" >/dev/null 2>&1 || { erro "Comando '$cmd' não encontrado no servidor."; exit 1; }
done

# Senha do sudo (usada só para reiniciar o serviço). No terminal (ssh -t) o
# sudo pergunta normalmente; pelo painel (sem terminal) ela chega na primeira
# linha da entrada padrão.
SENHA_SUDO=""
if [ ! -t 0 ]; then
  IFS= read -r SENHA_SUDO || true
fi
sudo_(){
  if [ -n "$SENHA_SUDO" ]; then
    printf '%s\n' "$SENHA_SUDO" | sudo -S -p '' "$@"
  else
    sudo "$@"
  fi
}
# confere a senha logo no começo, para não travar no meio da atualização
echo "A senha do sudo é usada só para reiniciar o serviço."
if ! sudo_ -v; then
  erro "Senha do sudo incorreta (ou o usuário não pode usar sudo)."
  exit 1
fi

ler_env(){
  grep -E "^$1=" "$ENV_PATH" | tail -n1 | cut -d= -f2- \
    | sed -e 's/\r$//' -e 's/^["'\'']//' -e 's/["'\'']$//' || true
}
DATABASE_URL="$(ler_env DATABASE_URL)"
PORTA="$(ler_env PORT)"; PORTA="${PORTA:-3001}"
[ -n "$DATABASE_URL" ] || { erro "DATABASE_URL não está no $ENV_PATH."; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar -xzf "$PACOTE" -C "$TMP"
if [ ! -f "$TMP/backend/dist/server.js" ] || [ ! -f "$TMP/frontend/dist/index.html" ]; then
  erro "Pacote incompleto (faltam backend/dist/server.js ou frontend/dist/index.html)."
  exit 1
fi
# o pacote vem do Windows: tira o CR do fim das linhas dos scripts
find "$TMP" -name '*.sh' -exec sed -i 's/\r$//' {} +

echo "Pasta do sistema: $RAIZ"
[ -f "$TMP/VERSAO" ] && { echo "Versão do pacote:"; sed 's/^/  /' "$TMP/VERSAO"; }

PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)

# ---- 2. Backup do banco ----
titulo "Backup do banco"
mkdir -p "$RAIZ/deploy/backups"
BACKUP="$RAIZ/deploy/backups/gestao_motel_antes-atualizacao_$CARIMBO.backup"
pg_dump "$DATABASE_URL" -F c -f "$BACKUP"
ok "Backup salvo em $BACKUP"

# ---- 3. Migrações ----
titulo "Migrações do banco"
"${PSQL[@]}" -c "CREATE TABLE IF NOT EXISTS migracoes_aplicadas (
  arquivo     TEXT PRIMARY KEY,
  aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);"
APLICADAS="$("${PSQL[@]}" -tAc "SELECT arquivo FROM migracoes_aplicadas")"

shopt -s nullglob
PENDENTES=()
for f in "$TMP"/database/migracoes/*.sql; do
  nome="$(basename "$f")"
  grep -qxF "$nome" <<< "$APLICADAS" || PENDENTES+=("$f")
done
shopt -u nullglob

if [ ${#PENDENTES[@]} -eq 0 ]; then
  echo "Nenhuma migração pendente."
else
  for f in "${PENDENTES[@]}"; do
    nome="$(basename "$f")"
    if [[ ! "$nome" =~ ^[A-Za-z0-9._-]+\.sql$ ]]; then
      erro "Nome de migração inválido: $nome"; exit 1
    fi
    echo "Aplicando $nome..."
    if ! "${PSQL[@]}" -f "$f"; then
      erro "A migração $nome falhou. Nada nos arquivos do sistema foi alterado; ele continua na versão anterior."
      erro "Migrações anteriores a esta (se houver) já foram aplicadas. Backup de antes: $BACKUP"
      erro "Para restaurar o banco: pg_restore --clean --if-exists -d \"<DATABASE_URL>\" \"$BACKUP\""
      exit 1
    fi
    "${PSQL[@]}" -c "INSERT INTO migracoes_aplicadas (arquivo) VALUES ('$nome') ON CONFLICT DO NOTHING"
    ok "  $nome aplicada."
  done
fi

# ---- 4. Guarda a versão atual ----
titulo "Guardando a versão atual"
ANTERIOR="$RAIZ/deploy/versoes-anteriores/$CARIMBO"
mkdir -p "$ANTERIOR"
[ -d "$BACKEND/dist" ]  && cp -a "$BACKEND/dist"  "$ANTERIOR/backend-dist"
[ -d "$FRONTEND/dist" ] && cp -a "$FRONTEND/dist" "$ANTERIOR/frontend-dist"
for arq in package.json package-lock.json; do
  [ -f "$BACKEND/$arq" ] && cp -a "$BACKEND/$arq" "$ANTERIOR/$arq"
done
[ -f "$RAIZ/VERSAO" ] && cp -a "$RAIZ/VERSAO" "$ANTERIOR/VERSAO"
echo "Versão atual guardada em $ANTERIOR"
# mantém só as 3 últimas
ls -1d "$RAIZ"/deploy/versoes-anteriores/*/ 2>/dev/null | sort | head -n -3 | xargs -r rm -rf

# ---- 5. Arquivos novos ----
titulo "Copiando os arquivos novos"
DEPENDENCIAS_MUDARAM=1
if [ -d "$BACKEND/node_modules" ] && [ -f "$BACKEND/package-lock.json" ] \
   && cmp -s "$BACKEND/package-lock.json" "$TMP/backend/package-lock.json"; then
  DEPENDENCIAS_MUDARAM=0
fi
rm -rf "$BACKEND/dist" "$FRONTEND/dist"
cp -a "$TMP/." "$RAIZ/"
ok "Arquivos copiados."

instalar_dependencias(){
  (cd "$BACKEND" && npm install --omit=dev --no-fund --no-audit)
}

# ---- 6. Dependências ----
titulo "Dependências"
if [ $DEPENDENCIAS_MUDARAM -eq 1 ]; then
  instalar_dependencias
else
  echo "Sem mudança nas dependências."
fi

# ---- 7. Reinício e verificação ----
saude(){
  for _ in $(seq 1 20); do
    if command -v curl >/dev/null 2>&1; then
      curl -fsS "http://127.0.0.1:$PORTA/api/saude" >/dev/null 2>&1 && return 0
    else
      node -e "fetch('http://127.0.0.1:$PORTA/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" && return 0
    fi
    sleep 1
  done
  return 1
}

titulo "Reiniciando o serviço"
sudo_ systemctl restart "$SERVICO"
if saude; then
  rm -f "$PACOTE"
  ok "\nAtualização concluída. Sistema respondendo em http://127.0.0.1:$PORTA"
  exit 0
fi

erro "O sistema não respondeu depois da atualização. Últimas linhas do log:"
journalctl -u "$SERVICO" -n 30 --no-pager || true

titulo "Voltando para a versão anterior"
rm -rf "$BACKEND/dist" "$FRONTEND/dist"
[ -d "$ANTERIOR/backend-dist" ]  && cp -a "$ANTERIOR/backend-dist"  "$BACKEND/dist"
[ -d "$ANTERIOR/frontend-dist" ] && cp -a "$ANTERIOR/frontend-dist" "$FRONTEND/dist"
for arq in package.json package-lock.json VERSAO; do
  [ -f "$ANTERIOR/$arq" ] || continue
  if [ "$arq" = VERSAO ]; then cp -a "$ANTERIOR/$arq" "$RAIZ/$arq"; else cp -a "$ANTERIOR/$arq" "$BACKEND/$arq"; fi
done
[ $DEPENDENCIAS_MUDARAM -eq 1 ] && instalar_dependencias
sudo_ systemctl restart "$SERVICO"
if saude; then
  aviso "O sistema voltou para a versão anterior e está respondendo."
else
  erro "Nem a versão anterior respondeu. Veja: journalctl -u $SERVICO -n 100"
fi
aviso "As migrações aplicadas NÃO foram desfeitas (backup de antes: $BACKUP)."
exit 1
