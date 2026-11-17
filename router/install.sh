#!/bin/sh
# Instalação do OrangeWifi em OpenWRT/UnTangled.
# Uso: sh install.sh   (executar no próprio roteador, com o pacote copiado via scp)
set -e

[ -f /etc/openwrt_release ] || { echo "ERRO: rode em OpenWRT/UnTangled."; exit 1; }

echo "== OrangeWifi: instalando pacotes =="
opkg update
opkg install coova-chilli dnsmasq-full curl ca-certificates ip-full || {
  echo "ERRO: falha ao instalar pacotes. Verifique conexão e repositórios."; exit 1;
}
# dnsmasq-full conflita com dnsmasq padrão
opkg remove dnsmasq 2>/dev/null || true

echo "== Copiando arquivos =="
cp -f etc/config/chilli /etc/config/chilli
cp -f etc/portal-cativo.conf /etc/portal-cativo.conf
chmod 600 /etc/portal-cativo.conf
mkdir -p /etc/dnsmasq.d /usr/share/portal-cativo
cp -f scripts/*.sh /usr/share/portal-cativo/
cp -f listas/adulto.txt /usr/share/portal-cativo/adulto.txt
chmod +x /usr/share/portal-cativo/*.sh

echo "== Configurando firewall (zona guest) =="
uci -q delete portalcativo.guest || true
uci set firewall.guestzone=zone
uci set firewall.guestzone.name='guest'
uci set firewall.guestzone.network='guest'
uci set firewall.guestzone.input='REJECT'
uci set firewall.guestzone.output='ACCEPT'
uci set firewall.guestzone.forward='REJECT'
uci set firewall.guestwan=forwarding
uci set firewall.guestwan.src='guest'
uci set firewall.guestwan.dest='wan'
uci set firewall.guestdns=rule
uci set firewall.guestdns.name='Permitir-DNS-guest'
uci set firewall.guestdns.src='guest'
uci set firewall.guestdns.dest_port='53'
uci set firewall.guestdns.proto='udp tcp'
uci set firewall.guestdns.target='ACCEPT'
uci set firewall.guestdhcp=rule
uci set firewall.guestdhcp.name='Permitir-DHCP-guest'
uci set firewall.guestdhcp.src='guest'
uci set firewall.guestdhcp.dest_port='67'
uci set firewall.guestdhcp.proto='udp'
uci set firewall.guestdhcp.target='ACCEPT'

echo "== Interface guest para o Chilli =="
uci -q delete network.guest || true
uci set network.guest=interface
uci set network.guest.proto='static'
uci set network.guest.ipaddr='192.168.182.1'
uci set network.guest.netmask='255.255.255.0'
uci commit network
uci commit firewall

echo "== Agendando tarefas (cron) =="
CRON=$(crontab -l 2>/dev/null | grep -v portal-cativo || true)
{
  echo "$CRON"
  echo "*/5 * * * * /usr/share/portal-cativo/coletar-logs.sh"
  echo "*/1 * * * * /usr/share/portal-cativo/autorizar-sessoes.sh"
  echo "0 4 * * *  /usr/share/portal-cativo/bloqueio-adulto.sh"
} | crontab -

echo "== Próximo passo: provisionar =="
echo "  sh provisionar.sh   (informa URL do backend, tenant e router token)"
