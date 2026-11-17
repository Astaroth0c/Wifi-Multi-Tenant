#!/bin/sh
# Provisionamento do gateway — interfaces, tenant e portal.
# Uso: sudo bash provisionar.sh [TENANT_ID] [ROUTER_TOKEN] [IF_WAN] [IF_GUEST]
set -e

[ "$(id -u)" = 0 ] || { echo "Rode como root."; exit 1; }

CONF=/etc/portal-cativo.conf
perguntar() {
  printf "%s: " "$1"
  read -r V
  echo "$V"
}

TENANT_ID=${1:-$(perguntar "Tenant ID (criado no painel admin)")}
ROUTER_TOKEN=${2:-$(perguntar "Router token do tenant")}
IF_WAN=${3:-$(perguntar "Interface de internet (ex.: eth0, enp3s0)")}
IF_GUEST=${4:-$(perguntar "Interface do Wi-Fi guest (ex.: eth1, wlan0)")}

cat > "$CONF" <<EOF
PORTAL_CATIVO_BACKEND="http://127.0.0.1:3000"
PORTAL_CATIVO_TENANT="$TENANT_ID"
PORTAL_CATIVO_TOKEN="$ROUTER_TOKEN"
PORTAL_CATIVO_WAN="$IF_WAN"
PORTAL_CATIVO_GUEST="$IF_GUEST"
PORTAL_CATIVO_REDE_GUEST="192.168.182.0/24"
PORTAL_CATIVO_IP_GUEST="192.168.182.1"
EOF
chmod 600 "$CONF"

. "$CONF"

echo "== Endereçando a rede guest =="
ip addr replace "$PORTAL_CATIVO_IP_GUEST/24" dev "$PORTAL_CATIVO_GUEST"
ip link set "$PORTAL_CATIVO_GUEST" up

echo "== dnsmasq guest (DHCP + DNS filtrado) =="
sed -i "s|interface=.*|interface=$PORTAL_CATIVO_GUEST|" /etc/dnsmasq-guest.conf
cp -f /etc/dnsmasq-guest.conf /etc/dnsmasq.d/portal-guest.conf
systemctl restart dnsmasq

echo "== nftables (captive portal + NAT) =="
sed -i "s|define IF_GUEST = .*|define IF_GUEST = \"$PORTAL_CATIVO_GUEST\"|" /etc/nftables-portal.conf
sed -i "s|define IF_WAN = .*|define IF_WAN = \"$PORTAL_CATIVO_WAN\"|" /etc/nftables-portal.conf
sed -i "s|define REDE_GUEST = .*|define REDE_GUEST = $PORTAL_CATIVO_REDE_GUEST|" /etc/nftables-portal.conf
sed -i "s|define IP_GUEST = .*|define IP_GUEST = $PORTAL_CATIVO_IP_GUEST|" /etc/nftables-portal.conf
cp -f /etc/nftables-portal.conf /etc/nftables.conf
nft -f /etc/nftables.conf
systemctl restart nftables

echo "== Cron (autorização a cada minuto, logs a cada 5) =="
CRON=$(crontab -l 2>/dev/null | grep -v portal-cativo || true)
{
  echo "$CRON"
  echo "*/1 * * * * /usr/share/portal-cativo/autorizar-sessoes.sh"
  echo "*/5 * * * * /usr/share/portal-cativo/coletar-logs.sh"
} | crontab -

bash /usr/share/portal-cativo/autorizar-sessoes.sh || true

echo
echo "Gateway provisionado."
echo "Teste: conecte um cliente na rede guest — todo HTTP cai no portal do backend."
