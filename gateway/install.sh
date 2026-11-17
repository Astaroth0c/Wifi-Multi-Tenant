#!/bin/sh
# Gateway Portal Cativo — Debian / Kali / Raspberry Pi OS
# Transforma um mini PC / Pi com 2 interfaces de rede no "roteador" do sistema:
# NAT, DHCP+DNS filtrado, captive portal por nftables e o backend na mesma máquina.
#
# Uso: sudo bash install.sh
set -e

[ "$(id -u)" = 0 ] || { echo "Rode como root: sudo bash install.sh"; exit 1; }

DIR_RAIZ="$(cd "$(dirname "$0")" && pwd)"

echo "== Portal Cativo Gateway: pacotes =="
export DEBIAN_FRONTEND=noninteractive
apt update
apt install -y postgresql nodejs npm dnsmasq nftables curl ca-certificates

echo "== Banco de dados =="
systemctl enable --now postgresql
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='portalcativo'" | grep -q 1 || {
  echo "Defina uma senha para o usuário do banco (portalcativo):"
  sudo -u postgres createuser --pwprompt portalcativo
}
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='portalcativo'" | grep -q 1 || \
  sudo -u postgres createdb -O portalcativo portalcativo

echo "== Backend =="
if [ ! -f "$DIR_RAIZ/../backend/package.json" ]; then
  echo "ERRO: execute este script dentro do repositório clonado (gateway/ ao lado de backend/)."
  exit 1
fi
cd "$DIR_RAIZ/../backend"
[ -f .env ] || { cp .env.example .env; chmod 600 .env; }
echo "REVISE o .env em $(pwd)/.env (DATABASE_URL, JWT_SECRET, DATA_KEY) antes de migrar."
npm install
npm run migrate

echo "== Arquivos do gateway =="
mkdir -p /etc/dnsmasq.d /usr/share/portal-cativo
cp -f "$DIR_RAIZ/etc/portal-cativo.conf" /etc/portal-cativo.conf
chmod 600 /etc/portal-cativo.conf
cp -f "$DIR_RAIZ/etc/dnsmasq-guest.conf" /etc/dnsmasq-guest.conf
cp -f "$DIR_RAIZ/etc/nftables-portal.conf" /etc/nftables-portal.conf
cp -f "$DIR_RAIZ/scripts/"*.sh /usr/share/portal-cativo/
cp -f "$DIR_RAIZ/../router/listas/adulto.txt" /usr/share/portal-cativo/adulto.txt
chmod +x /usr/share/portal-cativo/*.sh
bash /usr/share/portal-cativo/bloqueio-adulto.sh

echo "== Serviço do backend (systemd) =="
cp -f "$DIR_RAIZ/etc/portalcativo.service" /etc/systemd/system/portalcativo.service
cp -f "$DIR_RAIZ/etc/portalcativo.timer" /etc/systemd/system/ 2>/dev/null || true
cp -f "$DIR_RAIZ/etc/portalcativo-*.service" /etc/systemd/system/ 2>/dev/null || true
sed -i "s|WorkingDirectory=.*|WorkingDirectory=$DIR_RAIZ/../backend|" /etc/systemd/system/portalcativo.service
systemctl daemon-reload
systemctl enable --now portalcativo

echo "== Encaminhamento e firewall =="
sed -i 's/^#\?net.ipv4.ip_forward.*/net.ipv4.ip_forward=1/' /etc/sysctl.conf || true
sysctl -w net.ipv4.ip_forward=1 >/dev/null
systemctl enable nftables

echo
echo "Instalação base concluída."
echo "Próximo passo (define interfaces, tenant e portal):"
echo "  sudo bash provisionar.sh"
