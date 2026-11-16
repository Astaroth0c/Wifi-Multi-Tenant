#!/bin/sh
# Provisionamento do Portal Cativo no roteador.
# Uso: sh provisionar.sh [URL_BACKEND] [TENANT_ID] [ROUTER_TOKEN]
# Sem argumentos, pergunta interativamente.
set -e

CONF=/etc/portal-cativo.conf

perguntar() {
  printf "%s: " "$1"
  read -r VALOR
  echo "$VALOR"
}

URL_BACKEND=${1:-$(perguntar "URL do backend (ex.: http://192.168.1.50:3000)")}
TENANT_ID=${2:-$(perguntar "Tenant ID (criado no painel admin)")}
ROUTER_TOKEN=${3:-$(perguntar "Router token do tenant")}

cat > "$CONF" <<EOF
PORTAL_CATIVO_BACKEND="$URL_BACKEND"
PORTAL_CATIVO_TENANT="$TENANT_ID"
PORTAL_CATIVO_TOKEN="$ROUTER_TOKEN"
EOF
chmod 600 "$CONF"

UAMSERVER="$URL_BACKEND/portal/?tenant=$TENANT_ID"

uci set chilli.@chilli[0].uamserver="$UAMSERVER"
uci set chilli.@chilli[0].uamallowed="$URL_BACKEND"
uci set chilli.@chilli[0].radiusnasid="portal-$TENANT_ID"
uci commit chilli

# valida comunicação com o backend
if curl -fsS "$URL_BACKEND/v1/portal/config?tenant_id=$TENANT_ID" >/dev/null 2>&1; then
  echo "OK: backend respondeu para o tenant $TENANT_ID."
else
  echo "AVISO: backend não respondeu. Verifique URL, rede e tenant id."
fi

/etc/init.d/chilli restart
echo "Provisionamento concluído. Conecte um cliente ao Wi-Fi guest para testar o portal."
