#!/usr/bin/env bash
# Portal Cativo — menu de controle (tudo em um lugar, estilo "clicar e abrir")
#
# Uso:  sudo bash iniciar.sh
#
# Opções:
#   1) Configurar tudo (primeira vez ou consertar)
#   2) Iniciar servidor e abrir o painel no navegador
#   3) Mostrar QR Code do 2FA (para o app autenticador do celular)
#   4) Trocar a senha do admin
#   5) Ver status e credenciais
#   6) Parar servidor
set -uo pipefail

DIR_RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$DIR_RAIZ/backend/.env"
LOG="/tmp/portalcativo.log"
URL_ADMIN="http://localhost:3000/admin/"

rodando() { timeout 2 bash -c "</dev/tcp/127.0.0.1/3000" 2>/dev/null; }

abrir_navegador() {
  local URL="$1" USR="${SUDO_USER:-}"
  [ -n "$USR" ] || return 1
  for D in :0 :1; do
    su "$USR" -c "DISPLAY=$D xdg-open '$URL'" >/dev/null 2>&1 && return 0
  done
  return 1
}

iniciar() {
  if rodando; then
    echo "O servidor já está rodando:  $URL_ADMIN"
    return 0
  fi
  if [ ! -f "$ENV_FILE" ]; then
    echo "O servidor ainda não foi configurado — use a opção 1 primeiro."
    return 1
  fi
  echo "Iniciando servidor (roda em segundo plano, log em $LOG)..."
  ( cd "$DIR_RAIZ/backend" && nohup npm start > "$LOG" 2>&1 & )
  for _ in $(seq 1 30); do
    rodando && break
    sleep 1
  done
  if rodando; then
    echo
    echo " ✔ Servidor rodando!"
    echo "   Painel admin:   $URL_ADMIN"
    echo "   Portal cliente: http://localhost:3000/portal/"
    echo
    if abrir_navegador "$URL_ADMIN"; then
      echo " O painel deve ter aberto no seu navegador."
    else
      echo " Abra o navegador e digite:  $URL_ADMIN"
    fi
  else
    echo " ✘ O servidor não subiu. Últimas linhas do log:"
    tail -15 "$LOG"
    echo " Se for erro de banco, rode a opção 1 (Configurar tudo)."
  fi
}

parar() {
  if pkill -f "node src/index.js" 2>/dev/null; then
    echo " Servidor parado."
  else
    echo " O servidor não estava rodando."
  fi
}

status() {
  echo "=== STATUS ==="
  if systemctl is-active --quiet postgresql 2>/dev/null; then
    echo " PostgreSQL: rodando"
  else
    echo " PostgreSQL: PARADO  (corrija com: sudo systemctl start postgresql)"
  fi
  if rodando; then
    echo " Servidor:   rodando  →  $URL_ADMIN"
  else
    echo " Servidor:   parado (use a opção 2)"
    [ -f "$LOG" ] && { echo " --- últimas linhas do log ---"; tail -5 "$LOG"; }
  fi
  [ -f "$ENV_FILE" ] && echo " .env:       existe ($ENV_FILE)" || echo " .env:       NÃO existe (use a opção 1)"
  echo
  echo "=== CREDENCIAIS DO PAINEL ==="
  echo "   endereço:   $URL_ADMIN"
  echo "   e-mail:     admin@rede.local"
  echo "   senha:      troque-esta-senha"
  echo "   código 2FA: app autenticador do celular (use a opção 3 para gerar o QR)"
}

trocar_senha() {
  read -rsp " Nova senha do admin: " S1; echo
  read -rsp " Confirme a senha:    " S2; echo
  if [ -z "$S1" ] || [ "$S1" != "$S2" ]; then
    echo " Senhas vazias ou diferentes — nada foi alterado."
    return 1
  fi
  ADMIN_SENHA="$S1" bash "$DIR_RAIZ/configurar.sh" --reset-admin
}

menu() {
  while true; do
    echo
    echo "=============================================="
    echo " Portal Cativo — menu"
    if rodando; then echo " [servidor: RODANDO]"; else echo " [servidor: parado]"; fi
    echo "=============================================="
    echo " 1) Configurar tudo (primeira vez ou consertar)"
    echo " 2) Iniciar servidor e abrir o painel"
    echo " 3) Mostrar QR Code do 2FA"
    echo " 4) Trocar a senha do admin"
    echo " 5) Ver status e credenciais"
    echo " 6) Parar servidor"
    echo " 0) Sair"
    read -rp " Escolha uma opção e tecle Enter: " OP
    case "$OP" in
      1) bash "$DIR_RAIZ/configurar.sh" ;;
      2) iniciar ;;
      3) bash "$DIR_RAIZ/qr-2fa.sh" ;;
      4) trocar_senha ;;
      5) status ;;
      6) parar ;;
      0) exit 0 ;;
      *) echo " Opção inválida." ;;
    esac
  done
}

[ "$(id -u)" = 0 ] || { echo "Rode como root:  sudo bash iniciar.sh"; exit 1; }
menu
