#!/usr/bin/env bash
# Correção e auto-configuração do Portal Cativo — Debian / Kali / Raspberry Pi OS
#
# Faz tudo que costuma dar errado na instalação manual:
#   1. instala pacotes que faltam (node, npm, postgresql)
#   2. corrige o aviso de collation do PostgreSQL
#   3. cria o usuário e o banco (portalcativo) com senha gerada
#   4. escreve o backend/.env completo (DATABASE_URL, JWT_SECRET, DATA_KEY)
#   5. aplica o schema (migrate) e cria o admin (seed)
#
# Idempotente: pode rodar quantas vezes quiser. Só altera o que estiver quebrado.
#
# Uso:  sudo bash configurar.sh
#       sudo bash configurar.sh --reset-admin   (recria o admin com a senha ADMIN_SENHA)
set -euo pipefail

DIR_RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR_BACKEND="$DIR_RAIZ/backend"
ENV_FILE="$DIR_BACKEND/.env"

[ "$(id -u)" = 0 ] || { echo "ERRO: rode como root:  sudo bash configurar.sh"; exit 1; }
[ -d "$DIR_BACKEND" ] || { echo "ERRO: backend/ não encontrado em $DIR_RAIZ"; exit 1; }

SENHA_ADMIN="${ADMIN_SENHA:-TroqueEstaSenha123}"

echo "=============================================="
echo " Portal Cativo — correção e auto-configuração"
echo "=============================================="

# ---------------------------------------------------------------- 1. pacotes
echo "== [1/5] Verificando pacotes =="
export DEBIAN_FRONTEND=noninteractive
FALTANDO=""
command -v node >/dev/null 2>&1 || FALTANDO="$FALTANDO nodejs"
command -v npm  >/dev/null 2>&1 || FALTANDO="$FALTANDO npm"
command -v psql >/dev/null 2>&1 || FALTANDO="$FALTANDO postgresql"
if [ -n "$FALTANDO" ]; then
  echo "   instalando:$FALTANDO"
  apt update -qq 2>/dev/null || echo "   (apt update falhou — repositório quebrado no sistema; tentando instalar mesmo assim)"
  apt install -y -qq $FALTANDO
else
  echo "   tudo instalado."
fi
systemctl start postgresql 2>/dev/null || service postgresql start 2>/dev/null || true

# --------------------------------------------------------- 2. collation fix
echo "== [2/5] Corrigindo collation do PostgreSQL (se necessário) =="
sudo -u postgres psql -qc "ALTER DATABASE template1 REFRESH COLLATION VERSION;" 2>/dev/null && echo "   template1 ok" || echo "   template1: nada a corrigir"
sudo -u postgres psql -qc "ALTER DATABASE postgres REFRESH COLLATION VERSION;" 2>/dev/null && echo "   postgres ok" || echo "   postgres: nada a corrigir"

# ----------------------------------------------- 3. usuário e banco + .env
echo "== [3/5] Usuário, banco e .env =="
SENHA_BD=""
if [ -f "$ENV_FILE" ]; then
  SENHA_BD=$(sed -n 's|^DATABASE_URL=postgres://portalcativo:\([^@]*\)@.*|\1|p' "$ENV_FILE" | head -1)
fi

# testa a senha existente (se houver) — só mexe se não funcionar
SENHA_OK=false
if [ -n "$SENHA_BD" ]; then
  if psql "postgres://portalcativo:${SENHA_BD}@127.0.0.1:5432/postgres" -qc "select 1;" >/dev/null 2>&1; then
    SENHA_OK=true
    echo "   senha existente do banco: funcionando (mantida)."
  fi
fi
if [ "$SENHA_OK" != true ]; then
  SENHA_BD=$(openssl rand -hex 12)
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='portalcativo'" | grep -q 1; then
    sudo -u postgres psql -qc "ALTER ROLE portalcativo PASSWORD '${SENHA_BD}';"
    echo "   senha do usuário portalcativo REDEFINIDA (a anterior não funcionava)."
  else
    sudo -u postgres psql -qc "CREATE ROLE portalcativo LOGIN PASSWORD '${SENHA_BD}';"
    echo "   usuário portalcativo criado com senha gerada."
  fi
fi

# banco (com fallback para template0, que ignora o problema de collation)
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='portalcativo'" | grep -q 1; then
  sudo -u postgres createdb -O portalcativo portalcativo 2>/dev/null \
    || sudo -u postgres createdb -T template0 -O portalcativo portalcativo
  echo "   banco portalcativo criado."
else
  echo "   banco portalcativo já existe."
fi

# grava o .env completo (preserva o que já estiver correto)
mkdir -p "$DIR_BACKEND"
[ -f "$ENV_FILE" ] || touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

definir_var() {
  local CHAVE="$1" VALOR="$2"
  if grep -q "^${CHAVE}=" "$ENV_FILE"; then
    sed -i "s|^${CHAVE}=.*|${CHAVE}=${VALOR}|" "$ENV_FILE"
  else
    echo "${CHAVE}=${VALOR}" >> "$ENV_FILE"
  fi
}

definir_var DATABASE_URL "postgres://portalcativo:${SENHA_BD}@127.0.0.1:5432/portalcativo"
definir_var PORT 3000
definir_var HOST 0.0.0.0
definir_var NODE_ENV development
definir_var RETENCAO_DIAS 365

# segredos: gera se ausentes ou se ainda forem os placeholders do .env.example
if ! grep -q "^JWT_SECRET=" "$ENV_FILE" \
   || grep -q "^JWT_SECRET=troque" "$ENV_FILE" \
   || [ "$(grep '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2 | wc -c)" -lt 40 ]; then
  definir_var JWT_SECRET "$(openssl rand -hex 32)"
  echo "   JWT_SECRET gerado."
fi
if ! grep -q "^DATA_KEY=" "$ENV_FILE" \
   || grep -q "^DATA_KEY=chave-base64" "$ENV_FILE"; then
  definir_var DATA_KEY "$(openssl rand -base64 32)"
  echo "   DATA_KEY gerada."
fi
echo "   .env atualizado em $ENV_FILE"

# ------------------------------------------------------------- 4. dependências
echo "== [4/5] Dependências do backend =="
cd "$DIR_BACKEND"
[ -d node_modules ] || npm install --no-fund --no-audit 2>&1 | tail -1

# ------------------------------------------------------ 5. migrate + seed
echo "== [5/5] Schema e admin =="
npm run --silent migrate
echo "   schema aplicado."

if [ "${1:-}" = "--reset-admin" ]; then
  SAIDA_SEED=$(ADMIN_SENHA="$SENHA_ADMIN" npm run --silent seed 2>&1)
  echo "   admin (re)criado com a senha: $SENHA_ADMIN"
else
  SAIDA_SEED=$(npm run --silent seed 2>&1)
fi
echo "$SAIDA_SEED" | sed 's/^/   /'
TOTP_SECRET=$(echo "$SAIDA_SEED" | sed -n 's/^Segredo TOTP.*: //p' | tail -1)

# QR Code do 2FA para escanear com o app autenticador
if [ -n "$TOTP_SECRET" ]; then
  if ! command -v qrencode >/dev/null 2>&1; then
    apt install -y -qq qrencode >/dev/null 2>&1 || true
  fi
  if command -v qrencode >/dev/null 2>&1; then
    echo
    echo "   Abra o app autenticador no celular (Google Authenticator/Aegis):"
    echo "   toque em '+' > 'Ler QR Code' e aponte para a tela:"
    echo
    qrencode -t ANSIUTF8 "otpauth://totp/PortalCativo:admin?secret=${TOTP_SECRET}&issuer=PortalCativo" || true
  fi
fi

# ------------------------------------------------------------------ resumo
IP_LOCAL=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "=============================================="
echo " CONCLUÍDO — tudo pronto"
echo "=============================================="
echo " 1. Inicie o servidor:      cd $DIR_BACKEND && npm start"
echo " 2. Painel admin:           http://localhost:3000/admin/"
echo "    (ou na rede local)      http://${IP_LOCAL:-SEU_IP}:3000/admin/"
echo
echo " SEU LOGIN NO PAINEL (http://localhost:3000/admin/):"
echo "   e-mail:  admin@rede.local"
echo "   senha:   troque-esta-senha"
if [ -n "${TOTP_SECRET:-}" ]; then
  echo "   código 2FA: o número de 6 dígitos do app autenticador"
  echo "   (segredo para digitar manualmente no app: $TOTP_SECRET)"
fi
echo
echo " 3. No painel, aba 'Tenants': crie o tenant e copie o Tenant ID."
echo " 4. Portal do cliente:       http://localhost:3000/portal/?tenant=TENANT_ID"
echo
echo " Para redefinir a senha do admin depois:  sudo ADMIN_SENHA=NovaSenha123 bash configurar.sh --reset-admin"
