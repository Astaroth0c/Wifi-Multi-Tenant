#!/bin/sh
# Coleta queries DNS do dnsmasq e envia ao backend (/v1/roteador/logs).
# O backend registra os logs na cadeia de hash do tenant.
set -e

CONF=/etc/portal-cativo.conf
[ -f "$CONF" ] || exit 0
. "$CONF"

[ -n "$PORTAL_CATIVO_BACKEND" ] && [ -n "$PORTAL_CATIVO_TENANT" ] || exit 0

ARQ=/var/log/dnsmasq-portal.log
MARCA=/tmp/portal-cativo-offset
LOTE=/tmp/portal-cativo-lote.json

[ -f "$ARQ" ] || exit 0

# processa apenas linhas novas
ULTIMO=$(cat "$MARCA" 2>/dev/null || echo 0)
TOTAL=$(wc -l < "$ARQ")
[ "$TOTAL" -lt "$ULTIMO" ] && ULTIMO=0
[ "$TOTAL" -eq "$ULTIMO" ] && exit 0

tail -n +$((ULTIMO + 1)) "$ARQ" | grep ' query\[' | head -200 | awk -v sessao="$SESSAO" '
{
  dominio = ""; ip = "";
  for (i = 1; i <= NF; i++) {
    if ($i == "query") { dominio = $(i+2); ip = $NF }
  }
  if (dominio == "") next
  categoria = "geral"
  if (dominio ~ /adulto|porn/) categoria = "adulto"
  reg = sprintf("{\"tipo\":\"dns\",\"dominio\":\"%s\",\"categoria\":\"%s\",\"acao\":\"permitido\",\"ip_destino\":\"%s\"", dominio, categoria, ip)
  if (sessao != "") reg = reg ",\"sessao_id\":\"" sessao "\""
  regs = regs (regs == "" ? "" : ",") reg "}"
}
END {
  if (regs != "") printf "{\"registros\":[%s]}\n", regs
}' > "$LOTE"

if [ -s "$LOTE" ]; then
  curl -fsS -X POST "$PORTAL_CATIVO_BACKEND/v1/roteador/logs" \
    -H "content-type: application/json" \
    -H "X-Router-Token: $PORTAL_CATIVO_TOKEN" \
    -H "X-Tenant-Id: $PORTAL_CATIVO_TENANT" \
    --data @"$LOTE" --max-time 15 >/dev/null 2>&1 || {
    echo "AVISO: falha ao enviar logs; serão reenviados no próximo ciclo." >&2
    exit 0
  }
fi

echo "$TOTAL" > "$MARCA"
rm -f "$LOTE"
