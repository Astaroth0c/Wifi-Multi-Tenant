# Pacote do roteador — Portal Cativo (OpenWRT/UnTangled)

Provisionamento de um roteador com OpenWRT (ou UnTangled, baseado em OpenWRT)
como portal cativo do sistema: CoovaChilli + DNS filtrado + envio de logs ao
backend local.

## Conteúdo

```
install.sh        instala pacotes, firewall, cron e arquivos no roteador
provisionar.sh    informa backend/tenant/token e aponta o portal para o PWA
etc/config/chilli configuração UCI do CoovaChilli (template)
etc/portal-cativo.conf  variáveis centrais (backend, tenant, token)
scripts/bloqueio-adulto.sh  gera /etc/dnsmasq.d/bloqueio-adulto e recarrega
scripts/coletar-logs.sh     envia queries DNS ao backend em lotes
listas/adulto.txt lista local de domínios bloqueados
```

## Instalação resumida

```sh
scp -r router/ root@192.168.1.1:/tmp/portal-cativo
ssh root@192.168.1.1
sh /tmp/portal-cativo/install.sh
sh /tmp/portal-cativo/provisionar.sh http://IP_DO_SERVIDOR:3000 TENANT_ID ROUTER_TOKEN
```

Detalhes completos no `docs/MANUAL.md` (raiz do repositório).

## Notas

- O roteador **substitui o firmware de fábrica** por OpenWRT (flashing), ou usa
  o UnTangled se já instalado. O pacote é instalado **por cima** do OpenWRT.
- O modem da operadora permanece: este roteador fica **entre a internet e o
  Wi-Fi dos clientes** (rede `guest`).
- O bloqueio adulto é feito por DNS (dnsmasq `address=/dominio/`), apontando os
  domínios bloqueados para o próprio roteador.
- Os logs DNS são enviados ao backend a cada 5 minutos e entram na cadeia de
  hash do tenant.
