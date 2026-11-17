# OrangeWifi — Acesso remoto via EdgeVPN (opcional)

## Para que serve

Permitir que **você (admin)** acesse o painel OrangeWifi de fora da loja
(casa, celular) **sem abrir portas no roteador** e **sem IP público fixo**.

> ⚠️ A VPN **não** faz parte do caminho do cliente Wi-Fi. Os clientes continuam
> passando pelo portal cativo normalmente. Isso aqui é só o "corredor secreto"
> do administrador.

## Como funciona

O [EdgeVPN](https://github.com/mudler/edgevpn) (do mudler, o autor do LocalAI)
cria uma rede privada ponto a ponto (p2p, via libp2p). Não existe servidor
central: **um token identifica a rede** — quem tem o token, entra.

```
Sua casa                                Loja
┌──────────────┐                  ┌─────────────────────────┐
│ PC/celular   │      p2p         │ Servidor OrangeWifi     │
│ edgevpn      │◄────────────────►│ edgevpn (10.1.0.1)      │
│ (10.1.0.2)   │   criptografado  │ painel em :3000/admin/  │
└──────────────┘                  └─────────────────────────┘
```

## Instalação (no servidor da loja)

```bash
cd ~/Wifi-Multi-Tenant
sudo bash extras/vpn/instalar-edgevpn.sh
```

O script:
1. instala o binário do edgevpn (release oficial);
2. gera o token da rede e guarda em `/etc/orangewifi-vpn.env` (permissão 600);
3. cria e ativa o serviço `orangewifi-vpn.service` com o IP fixo `10.1.0.1`.

## Acessar de fora

No seu computador (em casa), instale o edgevpn e entre na MESMA rede com
outro IP fixo:

```bash
# pegue o token no servidor:  sudo cat /etc/orangewifi-vpn.env
EDGEVPNTOKEN=cole-o-token-aqui edgevpn --address 10.1.0.2/24
```

Depois abra `http://10.1.0.1:3000/admin/` — é o painel da loja, de dentro
da VPN. A conexão pode levar alguns minutos na primeira vez (descoberta p2p).

## Limites honestos

- O próprio autor avisa: o edgevpn **não passou por auditoria de segurança**
  e a rede p2p descentralizada é "conversadeira" (mais tráfego de controle).
- Para uso sério em produção, considere **WireGuard** (nativo no kernel,
  auditado) ou **Tailscale** (mais simples, mas com conta na nuvem).
- O token vale como senha: se vazar, qualquer um entra na rede. Revogue
  gerando um token novo e reiniciando o serviço em todas as máquinas.

## Comandos úteis

```bash
systemctl status orangewifi-vpn        # ver se a VPN está de pé
sudo journalctl -u orangewifi-vpn -f   # logs
sudo cat /etc/orangewifi-vpn.env       # ver o token (cuidado)
sudo systemctl disable --now orangewifi-vpn   # desligar a VPN
```
