#!/bin/sh
# Gera a lista de bloqueio adulto para o dnsmasq e recarrega (gateway Debian/Kali/Pi).
# Fontes: lista local /usr/share/portal-cativo/adulto.txt + lista remota opcional
# PORTAL_CATIVO_LISTA_URL em /etc/portal-cativo.conf.
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

IP_GUEST=${PORTAL_CATIVO_IP_GUEST:-192.168.182.1}
{
  echo "# gerado por bloqueio-adulto.sh em $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  awk -v ip="$IP_GUEST" '{ gsub(/\r/,""); print "address=/" $0 "/" ip }' "$TMP" | sort -u
} > "$SAIDA"

rm -f "$TMP"
systemctl restart dnsmasq
echo "Bloqueio adulto ativo ($(wc -l < "$SAIDA") entradas)."
