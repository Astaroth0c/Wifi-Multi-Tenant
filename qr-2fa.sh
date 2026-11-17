#!/usr/bin/env bash
# Mostra o QR Code do 2FA do painel admin (lê o segredo direto do banco).
# Uso:  sudo bash qr-2fa.sh
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Rode como root:  sudo bash qr-2fa.sh"; exit 1; }

if ! command -v qrencode >/dev/null 2>&1; then
  apt update -qq 2>/dev/null || true
  apt install -y -qq qrencode >/dev/null 2>&1 || true
fi
if ! command -v qrencode >/dev/null 2>&1; then
  echo "AVISO: não consegui instalar o qrencode (o apt deste sistema tem um"
  echo "repositório quebrado). Instale manualmente:  sudo apt install qrencode"
  echo "Enquanto isso, use o segredo abaixo no app autenticador:"
  echo "(no app: '+' > 'Digitar chave de configuração')"
fi

SEGREDO=$(sudo -u postgres psql -d portalcativo -tAc \
  "select totp_secret from admin_users order by id limit 1" 2>/dev/null || true)

if [ -z "$SEGREDO" ]; then
  echo "Nenhum admin encontrado no banco."
  echo "Rode primeiro:  sudo bash configurar.sh"
  exit 1
fi

echo "Abra o app autenticador no celular (Google Authenticator/Aegis):"
echo "toque em '+' > 'Ler QR Code' e aponte para a tela:"
echo
qrencode -t ANSIUTF8 "otpauth://totp/OrangeWifi:admin?secret=${SEGREDO}&issuer=OrangeWifi" 2>/dev/null \
  || true
echo
echo "Segredo (para digitar manualmente no app, se preferir): $SEGREDO"
echo
echo "Depois de escanear, faça login em http://localhost:3000/admin/ com:"
echo "  e-mail: admin@rede.local"
echo "  senha:  troque-esta-senha"
echo "  código 2FA: o número de 6 dígitos que o app mostra"
