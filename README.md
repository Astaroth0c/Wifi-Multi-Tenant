# OrangeWifi — Portal Cativo Wi-Fi Multi-Tenant

Sistema de portal cativo para Wi-Fi de clientes em lojas, baseado em OpenWRT + UnTangled,
com autenticação obrigatória, registro de acessos com integridade garantida (cadeia de hash)
e gestão multi-tenant.

## Estrutura do monorepo

| Diretório | Componente | Status |
|---|---|---|
| `backend/` | API REST multi-tenant (Node.js + Fastify + PostgreSQL) — serve portal e painel | ✅ 47 testes de integração |
| `portal/` | PWA do portal cativo (cadastro, SMS, sessão, liberação no Chilli) | ✅ concluído |
| `admin/` | Painel administrativo web (React + Vite), servido em `/admin/` | ✅ concluído |
| `app/` | App Android (React Native, APK assinado) — fonte + instruções de build | ✅ fonte concluída (APK compilado na sua máquina) |
| `router/` | Pacote de provisionamento OpenWRT/UnTangled (chilli, firewall, DNS filtrado, logs) | ✅ concluído |
| `gateway/` | Gateway em Debian/Kali/Raspberry Pi (nftables + dnsmasq + backend na mesma máquina) — alternativa para roteadores sem OpenWRT | ✅ concluído |
| `docs/` | Manual de instalação e uso | ✅ `docs/MANUAL.md` |

## Comece por aqui

**[docs/MANUAL.md](docs/MANUAL.md)** — instalação do servidor, criação do schema e do
primeiro admin, provisionamento do roteador, uso do portal/painel/app, backup, LGPD e
solução de problemas.

Resumo rápido:

```bash
# Tudo em um menu (recomendado no Kali/Debian/Pi): configura, inicia, mostra o QR do 2FA,
# abre o painel no navegador e troca a senha do admin:
sudo bash iniciar.sh

# …ou só a configuração automática (pacotes, banco, .env, schema e admin):
sudo bash configurar.sh

# …ou manualmente:
cd backend
cp .env.example .env          # ajuste DATABASE_URL, JWT_SECRET e DATA_KEY
npm install
npm run migrate               # aplica db/schema.sql (partições mensais inclusas)
npm run seed                  # cria admin da rede e imprime o segredo TOTP
npm start                     # http://localhost:3000
npm test                      # 47 testes de integração (PostgreSQL real embutido)

# Painel admin: http://SERVIDOR:3000/admin/  (build pronto em admin/dist)
# Portal cliente: http://SERVIDOR:3000/portal/?tenant=TENANT_ID

# Roteador (OpenWRT/UnTangled)
scp -r router/ root@IP_ROTEADOR:/tmp/portal-cativo
ssh root@IP_ROTEADOR "sh /tmp/portal-cativo/install.sh"
ssh root@IP_ROTEADOR "sh /tmp/portal-cativo/provisionar.sh http://IP_SERVIDOR:3000 TENANT_ID ROUTER_TOKEN"
```

## Destaques técnicos

- **Identidade OrangeWifi** — "Sua rede, sem nós.": painel e portal com visual glass
  laranja, tema claro/escuro, dashboard com resumo ao vivo (`GET /v1/admin/resumo`)
  e paleta de comandos (Ctrl+K) no painel.

- **Cadeia de hash encadeado** por tenant em todos os logs (qualquer alteração fora do
  expurgo quebra a cadeia — verificado pelo painel e pela API).
- **Logs particionados por mês**, append-only (trigger), expurgo por `DROP TABLE`
  registrado na auditoria (Marco Civil: 1 ano).
- **Multi-tenant** com isolamento verificado em testes; admin `loja` (só o próprio
  tenant) vs `rede` (todos).
- **Criptografia**: telefone/foto em AES-256-GCM na aplicação, lookup por HMAC-SHA256,
  senhas/PIN/códigos SMS com Argon2, 2FA TOTP para admins.
- **Roteador sem RADIUS externo**: o roteador consulta `GET /v1/roteador/autorizacoes`
  e autoriza MACs com `chilli_query`; o PWA também dispara o `logon` do uamport quando
  disponível.
