#!/usr/bin/env bash
# OrangeWifi — acesso remoto via EdgeVPN (opcional)
#
# Instala o edgevpn no servidor da loja e cria o serviço de VPN.
# A VPN serve para VOCÊ (admin) acessar o painel de fora da loja,
# SEM abrir portas no roteador. Não é usada pelo tráfego dos clientes.
#
# Uso:  sudo bash instalar-edgevpn.sh
#       sudo IP_VPN=10.1.0.1/24 bash instalar-edgevpn.sh   (IP fixo custom)
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Rode como root:  sudo bash instalar-edgevpn.sh"; exit 1; }

TOKEN_ENV=/etc/orangewifi-vpn.env
IP_VPN="${IP_VPN:-10.1.0.1/24}"

echo "== [1/3] Instalando o edgevpn =="
if ! command -v edgevpn >/dev/null 2>&1; then
  curl -sfL https://raw.githubusercontent.com/mudler/edgevpn/master/install.sh | sh
else
  echo "   já instalado: $(command -v edgevpn)"
fi

echo "== [2/3] Token da rede =="
if [ -s "$TOKEN_ENV" ]; then
  echo "   token existente mantido: $TOKEN_ENV"
else
  umask 077
  echo "EDGEVPNTOKEN=$(edgevpn -g -b)" > "$TOKEN_ENV"
  echo "   novo token gerado em $TOKEN_ENV"
fi

echo "== [3/3] Serviço systemd =="
cat > /etc/systemd/system/orangewifi-vpn.service <<EOF
[Unit]
Description=OrangeWifi — VPN de acesso remoto (EdgeVPN)
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=${TOKEN_ENV}
ExecStart=/usr/local/bin/edgevpn --address ${IP_VPN}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now orangewifi-vpn.service

IP_CURTO="${IP_VPN%%/*}"
cat <<FIM

 Pronto! Este servidor entrou na VPN com o IP fixo ${IP_CURTO}

 Para acessar o painel de fora da loja:
   1. Instale o edgevpn no SEU computador (releases em github.com/mudler/edgevpn)
   2. Rode com o MESMO token e outro IP, ex.:
        EDGEVPNTOKEN=\$(grep -o 'EDGEVPNTOKEN=.*' ${TOKEN_ENV} | cut -d= -f2-) \\
          edgevpn --address 10.1.0.2/24
   3. Abra:  http://${IP_CURTO}:3000/admin/

 ATENÇÃO: o token é a CHAVE da rede — quem tiver o token entra.
 Guarde-o como uma senha. (O edgevpn não passou por auditoria de
 segurança; para acesso remoto sério, considere WireGuard/Tailscale.)
FIM
