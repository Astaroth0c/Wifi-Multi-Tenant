#!/bin/sh
# Consulta o backend por sessões autenticadas recentes e autoriza os MACs
# no CoovaChilli via chilli_query (modo sem RADIUS).
set -e

CONF=/etc/portal-cativo.conf
[ -f "$CONF" ] || exit 0
. "$CONF"

[ -n "$PORTAL_CATIVO_BACKEND" ] && [ -n "$PORTAL_CATIVO_TOKEN" ] || exit 0

LISTA=/tmp/portal-cativo-autorizacoes.json
LIBERADAS=/tmp/portal-cativo-liberadas
touch "$LIBERADAS"

curl -fsS "$PORTAL_CATIVO_BACKEND/v1/roteador/autorizacoes" \
  -H "X-Router-Token: $PORTAL_CATIVO_TOKEN" \
  --max-time 15 > "$LISTA" 2>/dev/null || exit 0

# extrai sessao_id e mac (sem dependência de jq)
jsonfilter -i "$LISTA" -F '@.sessao_id' -F '@.mac' -s '$.autorizacoes[*]' 2>/dev/null | \
{
  SESSAO=""
  while read -r VALOR; do
    case "$VALOR" in
      *-*) SESSAO="$VALOR" ;;
      *:*:*)
        [ -n "$SESSAO" ] || continue
        grep -q "^$SESSAO$" "$LIBERADAS" && continue
        if chilli_query authorize "$SESSAO" sessiontimeout=43200 2>/dev/null; then
          echo "$SESSAO" >> "$LIBERADAS"
          logger -t portal-cativo "sessao $SESSAO autorizada (mac $VALOR)"
        fi
        SESSAO=""
        ;;
    esac
  done
}

# mantém o arquivo de liberadas enxuto (últimas 500)
tail -n 500 "$LIBERADAS" > "$LIBERADAS.tmp" 2>/dev/null && mv "$LIBERADAS.tmp" "$LIBERADAS" || true
