#!/bin/sh
# Gera a lista de bloqueio adulto para o dnsmasq e recarrega.
# Fontes: lista local /usr/share/portal-cativo/adulto.txt + lista remota opcional
# configurada em /etc/portal-cativo.conf (PORTAL_CATIVO_LISTA_URL).
set -e

CONF=/etc/portal-cativo.conf
[ -f "$CONF" ] && . "$CONF"

SAIDA=/etc/dnsmasq.d/bloqueio-adulto
TMP=/tmp/bloqueio-adulto.tmp
mkdir -p /etc/dnsmasq.d

: > "$TMP"

if [ -f /usr/share/portal-cativo/adulto.txt ]; then
  grep -v '^#' /usr/share/portal-cativo/adulto.txt | grep -v '^$' >> "$TMP" || true
fi

if [ -n "$PORTAL_CATIVO_LISTA_URL" ]; then
  curl -fsS --max-time 30 "$PORTAL_CATIVO_LISTA_URL" >> "$TMP" 2>/dev/null || \
    echo "AVISO: lista remota indisponível, mantendo lista local" >&2
fi

{
  echo "# gerado por bloqueio-adulto.sh em $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  awk '{ gsub(/\r/,""); print "address=/" $0 "/192.168.182.1" }' "$TMP" | sort -u
} > "$SAIDA"

rm -f "$TMP"
/etc/init.d/dnsmasq restart
echo "Bloqueio adulto ativo ($(wc -l < "$SAIDA") entradas)."
