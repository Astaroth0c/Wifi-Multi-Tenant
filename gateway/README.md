# Gateway OrangeWifi — Debian / Kali / Raspberry Pi OS

Alternativa ao pacote `router/` (OpenWRT) para quando não há roteador
compatível: um **mini PC, Raspberry Pi ou PC velho com 2 interfaces de rede**
assume o papel de roteador — NAT, DHCP, DNS filtrado, captive portal e o
**backend na mesma máquina**. Os roteadores Mercusys ficam como **APs burros**
(modo Access Point) irradiando o Wi-Fi guest.

## Topologia

```
internet ── modem ── [IF_WAN] GATEWAY [IF_GUEST] ── switch/APs Mercusys ── celulares dos clientes
                                   │
                                   └── backend + banco (mesma máquina, porta 3000)
```

## Como funciona (sem CoovaChilli, sem RADIUS)

- **dnsmasq** faz DHCP (192.168.182.0/24) e DNS na rede guest, com bloqueio
  adulto por `address=/dominio/`.
- **nftables** faz o portal cativo:
  - clientes **não autorizados**: HTTP/HTTPS é redirecionado (DNAT) para o
    PWA do backend na porta 3000;
  - clientes **autorizados**: tráfego liberado com NAT para a internet;
  - DNS, DHCP e a porta do portal sempre passam.
- **Autorização**: script de cron consulta `GET /v1/roteador/autorizacoes`
  a cada minuto e sincroniza os MACs/IPs das sessões ativas nos sets do
  nftables — quem encerra a sessão, esgota o limite diário ou é suspenso
  perde a autorização no próximo ciclo.
- **Logs**: `log-queries` do dnsmasq é coletado a cada 5 min e enviado ao
  backend, entrando na cadeia de hash do tenant.

## Instalação

```sh
git clone https://github.com/Astaroth0c/Wifi-Multi-Tenant.git
cd Wifi-Multi-Tenant/gateway
sudo bash install.sh         # pacotes, banco, backend (systemd), firewall
# revise backend/.env (DATABASE_URL, JWT_SECRET, DATA_KEY) e rode:
cd ../backend && npm run seed
sudo bash provisionar.sh TENANT_ID ROUTER_TOKEN IF_WAN IF_GUEST
```

`install.sh` cria o usuário/banco do PostgreSQL (a senha você escolhe na
hora), aplica o schema, instala o serviço `portalcativo` (systemd) e prepara
dns/nftables/cron. `provisionar.sh` endereça a rede guest, aplica as regras
de nftables com as suas interfaces e ativa os crons.

## Requisitos de hardware

- 2 interfaces de rede (ex.: eth0 para o modem + eth1 para o AP; no Pi, a
  ethernet + um adaptador USB-LAN).
- 2 GB de RAM recomendados (roda banco + backend + firewall).
- Raspberry Pi 4/5, mini PC x86 ou PC desktop servem.

## Comandos úteis

```sh
systemctl status portalcativo        # backend
nft list set inet portalcativo autorizados_mac   # quem está liberado
tail -f /var/log/dnsmasq-portal.log  # queries DNS ao vivo
journalctl -u portalcativo -f        # log do backend (código SMS em modo dev)
```
