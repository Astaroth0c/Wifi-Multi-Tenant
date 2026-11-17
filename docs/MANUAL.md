# Manual de Instalação e Uso — Portal Cativo Wi-Fi Multi-Tenant

Sistema completo de portal cativo para Wi-Fi de clientes: backend API, PWA do
portal, painel admin web, app Android e pacote de provisionamento para
roteadores OpenWRT/UnTangled.

---

## 1. Visão geral dos componentes

| Componente | Onde roda | Pasta | Acesso |
|---|---|---|---|
| Backend API (Fastify + PostgreSQL) | Servidor local da loja (ou mini PC / VPS na rede da loja) | `backend/` | porta 3000 |
| Portal cliente (PWA) | Servido pelo próprio backend | `portal/` | `http://SERVIDOR:3000/portal/` |
| Painel admin (React) | Servido pelo próprio backend | `admin/` | `http://SERVIDOR:3000/admin/` |
| App Android (React Native) | Celulares da gestão | `app/` | APK assinado |
| Roteador (CoovaChilli + DNS filtrado) | Roteador com OpenWRT/UnTangled | `router/` | — |

### Resposta à dúvida: "substituiremos o software de algum roteador?"

**Sim, do roteador — não do modem.**

- O roteador que atende o Wi-Fi de clientes passa a rodar **OpenWRT** (ou
  **UnTangled**, que é baseado em OpenWRT). Isso significa **substituir o
  firmware de fábrica** do aparelho por OpenWRT (processo de "flashing"). Só é
  possível em hardware compatível — a lista está em
  [openwrt.org/toh](https://openwrt.org/toh/start). Roteadores comuns como
  TP-Link Archer, Xiaomi, D-Link etc. têm builds prontos.
- Se o aparelho **já tem UnTangled/OpenWRT**, não há flashing: basta instalar
  nosso pacote (`router/install.sh`).
- O **modem da operadora continua como está**. Nosso roteador fica **entre a
  internet e os clientes**: WAN do roteador ligada no modem/switch da loja, e
  o Wi-Fi `guest` (portal cativo) irradiado por ele.
- Sobre esse OpenWRT instalamos **CoovaChilli** (portal cativo), **dnsmasq**
  com filtro DNS adulto e os scripts de coleta de logs — tudo do pacote
  `router/`. O firmware de fábrica não consegue rodar nada disso; por isso a
  substituição é necessária.

---

## 2. Instalação do servidor (backend)

### 2.1 Requisitos

- Linux (Debian/Ubuntu recomendado), 2 GB RAM mínimo.
- Node.js 20 ou 22 — [nodejs.org](https://nodejs.org).
- PostgreSQL 14+ (recomendado 17). Em servidor sem Docker:

```sh
sudo apt install postgresql
sudo -u postgres createuser --pwprompt portalcativo
sudo -u postgres createdb -O portalcativo portalcativo
```

### 2.2 Instalação

```sh
git clone https://github.com/Astaroth0c/Wifi-Multi-Tenant.git
cd Wifi-Multi-Tenant/backend
npm install
```

### 2.3 Configuração

```sh
cp .env.example .env
nano .env
```

Variáveis obrigatórias:

| Variável | Descrição |
|---|---|
| `PORT` | Porta da API (padrão 3000) |
| `DATABASE_URL` | `postgres://portalcativo:SENHA@127.0.0.1:5432/portalcativo` |
| `JWT_SECRET` | Secret dos tokens JWT — gere com `openssl rand -hex 32` |
| `DATA_KEY` | Chave AES-256 base64 — gere com `openssl rand -base64 32` |

Opcional: `RETENCAO_DIAS` (padrão 365 — Marco Civil), `PORTAL_DIR`, `ADMIN_DIR`.

### 2.4 Criar schema e o primeiro admin

```sh
npm run migrate   # cria tabelas, partições e triggers
npm run seed      # cria o admin da REDE e imprime o segredo TOTP
```

O `seed` imprime o **segredo TOTP**. Cadastre-o no app autenticador
(Google Authenticator, Aegis, Authy) escaneando o QR ou digitando o código.
**Guarde esse segredo — sem ele não há login.**

### 2.5 Rodar

```sh
npm start        # produção
npm run dev      # desenvolvimento (reinicia a cada alteração)
```

Sanidade: `curl http://localhost:3000/v1/health` deve responder `{"status":"ok"}`.

Para o servidor subir com a máquina, crie um serviço systemd:

```ini
# /etc/systemd/system/portalcativo.service
[Unit]
Description=Portal Cativo API
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/Wifi-Multi-Tenant/backend
ExecStart=/usr/bin/node src/index.js
Restart=always
User=portalcativo
EnvironmentFile=/opt/Wifi-Multi-Tenant/backend/.env

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl enable --now portalcativo
```

---

## 3. Painel admin (web)

Acesse `http://SERVIDOR:3000/admin/` (o backend serve o painel pronto — não
precisa de Node/npm no navegador da loja).

### 3.1 Primeiro acesso

1. Login com e-mail, senha e **código TOTP** do autenticador.
2. O admin **da rede** vê todos os tenants e tem a aba extra "Tenants".
3. O admin **da loja** vê apenas o próprio tenant.

### 3.2 Criar um tenant (admin da rede)

Aba **Tenants** → nome, CNPJ, limite diário → **Criar**. Anote o
**Tenant ID** e o **Router Token** (visível na aba Configurações) — os dois
provisionam o roteador.

### 3.3 Módulos

- **Clientes** — busca, filtro por status, ficha completa (dispositivos,
  sessões, resumo de logs), exportação CSV/PDF, suspender/reativar/excluir
  (exclusão anonimiza e registra na auditoria).
- **Sessões ao vivo** — sessões ativas, atualização a cada 15 s.
- **Logs** — filtros por sessão, domínio, ação, categoria e período;
  **indicador "cadeia íntegra"** no topo.
- **Configurações** — limite diário, bloqueio adulto, SSID, identidade visual
  (cor/nome do portal), gateway SMS, router token.
- **Auditoria** — todo login, visualização de ficha e ação sensível.

### 3.4 Revogar sessões admin

**Configurações** ou API: `POST /v1/admin/tokens/revogar` invalida todos os
tokens do próprio admin (tokens duram 30 min).

---

## 4. Roteador (OpenWRT/UnTangled)

### 4.1 Instalar OpenWRT (se o roteador tem firmware de fábrica)

1. Confirme o modelo em [openwrt.org/toh](https://openwrt.org/toh/start).
2. Baixe a imagem *factory* ou *sysupgrade* indicada.
3. Atualize o firmware pela interface do próprio roteador (na maioria dos
   modelos) ou por TFTP, conforme o guia do modelo.
4. Após o boot, acesse `http://192.168.1.1` (LuCI).

### 4.2 Instalar o pacote do Portal Cativo

```sh
scp -r router/ root@IP_DO_ROTEADOR:/tmp/portal-cativo
ssh root@IP_DO_ROTEADOR
sh /tmp/portal-cativo/install.sh
```

O `install.sh` instala CoovaChilli, dnsmasq-full e curl, cria a rede `guest`
(192.168.182.0/24), as regras de firewall, o cron (coleta de logs a cada 5
min, autorização de sessões a cada 1 min, atualização do bloqueio às 4h) e
roda o bloqueio adulto inicial.

### 4.3 Provisionar

```sh
sh /tmp/portal-cativo/provisionar.sh http://IP_DO_SERVIDOR:3000 TENANT_ID ROUTER_TOKEN
```

Isso aponta o portal cativo do Chilli para o nosso PWA
(`http://SERVIDOR:3000/portal/?tenant=TENANT_ID`) e salva as credenciais em
`/etc/portal-cativo.conf` (permissão 600).

### 4.4 Como funciona a liberação de internet

1. Cliente conecta no Wi-Fi `guest` → Chilli redireciona para o PWA.
2. PWA autentica no backend (cadastro + SMS, login ou reconexão por MAC).
3. PWA chama o `logon` do Chilli no uamport (se acessível) **e** o roteador,
   a cada minuto, consulta `GET /v1/roteador/autorizacoes` e autoriza os MACs
   das sessões válidas com `chilli_query authorize` — **não precisa de
   RADIUS externo**.
4. Quando a sessão expira ou o limite diário é atingido, o backend deixa de
   autorizar e o Chilli encerra a sessão.

### 4.5 Bloqueio adulto

- Lista local: `router/listas/adulto.txt` (edite e rode
  `/usr/share/portal-cativo/bloqueio-adulto.sh`).
- Lista remota: em `/etc/portal-cativo.conf` adicione
  `PORTAL_CATIVO_LISTA_URL="https://..."` — atualiza diariamente às 4h.
- Bloqueios por DNS (`address=/dominio/192.168.182.1`); tentativas aparecem
  nos logs com categoria `adulto`.

### 4.6 Alternativa: gateway em Debian/Kali/Raspberry Pi (sem OpenWRT)

Quando não há roteador compatível com OpenWRT (ex.: Mercusys MW301R, MW330HP
e MR30G não têm suporte), um **mini PC / Pi / PC velho com 2 interfaces de
rede** assume o papel de roteador e ainda roda o backend na mesma máquina.
Os roteadores comuns ficam em **modo Access Point** (DHCP desligado, ligados
na LAN do gateway) irradiando o Wi-Fi guest.

```sh
git clone https://github.com/Astaroth0c/Wifi-Multi-Tenant.git
cd Wifi-Multi-Tenant/gateway
sudo bash install.sh        # pacotes, PostgreSQL, backend (systemd), firewall
cd ../backend && npm run seed
sudo bash provisionar.sh TENANT_ID ROUTER_TOKEN IF_WAN IF_GUEST
```

Portal cativo por **nftables**: clientes não autorizados têm HTTP/HTTPS
redirecionado ao PWA; os autorizados (sincronizados do backend a cada minuto)
navegam com NAT. DNS filtrado por dnsmasq; logs entram na mesma cadeia de
hash. Detalhes em `gateway/README.md`.

---

## 5. Portal cliente (PWA)

Os clientes acessam automaticamente pelo popup do portal cativo. Parâmetros
recebidos do Chilli: `tenant`, `mac`, `ip`, `uamip`, `uamport`, `sessionid`.

Fluxo:

1. **Boas-vindas** — mostra SSID, aviso de privacidade (Marco Civil/LGPD).
2. **Cadastro** — nome, e-mail, telefone, senha, **foto obrigatória**
   (câmera ou arquivo) e aceite dos termos.
3. **SMS** — código de 6 dígitos (gateway `dev` imprime o código no log do
   servidor; em produção configure um gateway HTTP).
4. **Conectado** — tempo restante, polling a cada 30 s; encerra ao clicar.
5. **Visitas futuras** — login por e-mail/telefone + senha **ou PIN**, ou
   reconexão automática por MAC no mesmo dia.

Acesso manual (teste): `http://SERVIDOR:3000/portal/?tenant=TENANT_ID`.

---

## 6. App Android

Fonte em `app/` (React Native). O APK é compilado e assinado na sua máquina —
passo a passo completo em `app/README.md` (gerar projeto android, `gradlew
assembleRelease`, keystore e assinatura). Instalação por APK direto no
celular, fora da Play Store.

O app tem as mesmas permissões do painel: sessões ao vivo, gestão de clientes
(suspender/excluir), logs com indicador de cadeia, limite diário e bloqueio
adulto. O endereço do servidor é configurado na aba **Config** do app.

---

## 7. Gateway SMS (produção)

Por padrão (`gateway_sms.provedor = "dev"`) o código aparece no log do
servidor — útil para testes. Para produção, na aba **Configurações** escolha
`http` e implemente um endpoint de envio compatível com
`POST {URL_SMS}` (configurável em `.env`), recebendo telefone e mensagem. O
código de 6 dígitos, o hash (Argon2) e a validade (10 min, 5 tentativas) já
são gerenciados pelo backend.

---

## 8. Backup e LGPD

- **Backup diário** do PostgreSQL:

```sh
# crontab do servidor
0 3 * * * pg_dump -U portalcativo portalcativo | gzip > /var/backups/portal-$(date +\%F).sql.gz
```

- Criptografe o backup se sair da loja:
  `gpg -c backup.sql.gz` (senha forte, guardada fora do servidor).
- **Teste de restauração mensal**: restaure o dump em um banco de teste e
  rode `npm test` apontando para ele.
- **Expurgo automático**: partições mensais de logs são descartadas após
  `RETENCAO_DIAS` (365 = Marco Civil); o descarte é registrado na auditoria.
  Admin da rede pode forçar com `POST /v1/admin/expurgo`.
- **Pedido do titular**: o próprio cliente pode exportar
  (`GET /v1/privacidade/meus-dados`) e pedir exclusão
  (`DELETE /v1/privacidade/meus-dados`) — dados pessoais são anonimizados e
  os logs preservados pelo prazo legal.
- Integridade: `GET /v1/admin/logs/cadeia` (ou indicador no painel) verifica
  a cadeia de hash encadeado; qualquer alteração fora do expurgo quebra a
  cadeia e fica visível.

---

## 9. Solução de problemas

| Sintoma | Causa provável | Correção |
|---|---|---|
| Portal não abre ao conectar no Wi-Fi | Chilli sem `uamserver` correto | Rode `provisionar.sh` de novo; confira `uci show chilli` |
| `curl /v1/health` falha | Backend parado / PostgreSQL fora | `systemctl status portalcativo`, `systemctl status postgresql` |
| Login do painel sempre "totp_invalido" | Relógio do servidor/celular adiantado | Ajuste NTP (`timedatectl set-ntp true`) |
| SMS não chega | Gateway `dev` em produção | Configure provedor `http` na aba Configurações |
| Cliente conecta mas sem internet | Sessão não autorizada pelo roteador | Veja `logread -e portal-cativo`; confira router token em `/etc/portal-cativo.conf` |
| "Cadeia QUEBRADA" no painel | Edição/apagamento manual de logs | Investigue imediatamente; a cadeia é prova de integridade |
| Limite diário não aplica | Config do tenant com limite alto | Aba Configurações → limite diário |
| Painel 404 | `admin/dist` inexistente | `cd admin && npm install && npm run build` |

---

## 10. Resumo de URLs e comandos

| Item | Valor |
|---|---|
| Portal cliente | `http://SERVIDOR:3000/portal/?tenant=TENANT_ID` |
| Painel admin | `http://SERVIDOR:3000/admin/` |
| Health check | `http://SERVIDOR:3000/v1/health` |
| Migrar banco | `npm run migrate` (em `backend/`) |
| Criar admin | `npm run seed` (imprime segredo TOTP) |
| Testes | `npm test` (46 testes de integração) |
