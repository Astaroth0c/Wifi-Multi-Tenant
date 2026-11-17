#!/bin/sh
# Sincroniza os MACs autorizados no nftables com as sessões ativas do backend.
# Roda a cada 1 minuto (cron). Idempotente: limpa os sets e recarrega do backend.
set -e

CONF=/etc/portal-cativo.conf
[ -f "$CONF" ] || exit 0
. "$CONF"

[ -n "$PORTAL_CATIVO_BACKEND" ] && [ -n "$PORTAL_CATIVO_TOKEN" ] || exit 0

LISTA=/tmp/portal-cativo-autorizacoes.json

curl -fsS "$PORTAL_CATIVO_BACKEND/v1/roteador/autorizacoes" \
  -H "X-Router-Token: $PORTAL_CATIVO_TOKEN" \
  --max-time 15 > "$LISTA" 2>/dev/null || exit 0

nft flush set inet portalcativo autorizados_mac 2>/dev/null || true
nft flush set inet portalcativo autorizados_ip 2>/dev/null || true

MACS=$(grep -o '"mac":"[^"]*"' "$LISTA" | cut -d'"' -f4)
IPS=$(grep -o '"ip_interno":"[^"]*"' "$LISTA" | cut -d'"' -f4)

for M in $MACS; do
  nft add element inet portalcativo autorizados_mac "{ $M }" 2>/dev/null || true
done
for I in $IPS; do
  nft add element inet portalcativo autorizados_ip "{ $I }" 2>/dev/null || true
done

logger -t portal-cativo "gateway: $(echo "$MACS" | grep -c .) sessoes autorizadas"
