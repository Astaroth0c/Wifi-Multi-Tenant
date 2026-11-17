# OrangeWifi — Backend (MVP)

API REST multi-tenant (Node.js + Fastify + PostgreSQL) do portal cativo para Wi-Fi
de clientes em lojas, conforme o spec aprovado. Serve o portal do cliente (PWA),
o painel admin web e o app Android — todos pela mesma API.

## Como rodar

```bash
cp .env.example .env         # ajuste DATABASE_URL, JWT_SECRET e DATA_KEY
npm install
npm run migrate              # aplica db/schema.sql (partições mensais inclusas)
npm run seed                 # cria admin da rede e imprime o segredo TOTP
npm start                    # http://localhost:3000
```

`DATA_KEY` deve ser uma chave base64 de 32 bytes (AES-256-GCM para foto/telefone em repouso):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Testes

```bash
npm test                     # 47 testes de integração com PostgreSQL real (embedded-postgres)
```

## Portal PWA (`/portal/`) e Painel Admin (`/admin/`)

O backend serve o PWA em `/portal/` (raiz `/` redireciona para lá) quando o diretório
`../portal` existe — sem build, sem CDN externa, compatível com o popup do captive portal.
Fluxo: reconexão automática por MAC → boas-vindas com aviso LGPD → cadastro (foto por
câmera ou upload) → código SMS → conectado com polling do tempo restante. O caminho do
PWA pode ser ajustado com `PORTAL_DIR`.

O painel admin (React) é servido em `/admin/` a partir de `../admin/dist` (ajustável com
`ADMIN_DIR`); a raiz `/admin` redireciona para `/admin/`. Para regenerar o build:
`cd admin && npm install && npm run build`.

## Endpoints principais (`/v1`)

Portal do cliente (header `X-Tenant-Id`):

- `GET /portal/config?tenant_id=...` — dados públicos do tenant (nome, SSID, limite, aviso LGPD, versões dos termos)

- `POST /auth/cadastro` — nome, email, telefone, senha, PIN opcional, **foto obrigatória** (data URL), **consentimento obrigatório** (versão dos termos)
- `POST /auth/verificar` — código SMS de 6 dígitos (gateway `dev` devolve o código na resposta; `http` faz POST ao gateway do tenant)
- `POST /auth/reenviar-codigo`
- `POST /auth/login` — email/telefone + senha **ou** PIN (4–6 dígitos); bloqueio após 5 tentativas
- `POST /auth/reconectar` — reconexão automática por MAC conhecido com sessão no dia
- `POST /sessoes` / `GET /sessoes/atual` / `POST /sessoes/encerrar` — sessão MAC+IP, limite diário (padrão 2h) e expiração de 12h
- `GET|DELETE /privacidade/meus-dados` — LGPD: acesso e exclusão do titular (anonimiza, preserva logs)

Roteador (header `X-Router-Token`, por tenant):

- `POST /roteador/logs` — ingestão em lote com **cadeia de hash encadeada por tenant** (transação + `FOR UPDATE` no estado da cadeia)

Admin (JWT de 30 min; login com **senha + TOTP**):

- `POST /admin/login`, `POST /admin/tokens/revogar`
- `GET|PATCH|DELETE /admin/clientes`, `GET /admin/clientes/:id` (ficha), `GET /admin/clientes/:id/exportar?formato=csv|pdf`
- `GET /admin/sessoes/ao-vivo`, `GET /admin/logs`, `GET /admin/logs/cadeia` (indicador "cadeia íntegra")
- `GET|PUT /admin/config` (SSID, limite diário, categorias, identidade visual, gateway SMS)
- `POST /admin/tenants` (só admin da rede), `GET /admin/auditoria`, `POST /admin/expurgo` (só rede)

## Garantias implementadas

- **Integridade dos logs**: `logs_acesso` é append-only (trigger bloqueia UPDATE/DELETE), particionada por mês; cada registro carrega `hash_anterior`/`hash_proprio` (SHA-256 encadeado por tenant); expurgo derruba partições inteiras e registra na `auditoria_admin`.
- **Multi-tenant**: `tenant_id` em todas as tabelas de negócio; admin "loja" é forçado ao próprio tenant, admin "rede" acessa tudo; token do roteador é por tenant.
- **Privacidade**: telefone e foto cifrados em repouso (AES-256-GCM), lookup por HMAC-SHA256; senhas/PIN/códigos SMS com Argon2; exclusão do titular anonimiza PII e mantém logs.
- **Retenção**: expurgo diário agendado (padrão 365 dias — Marco Civil) + execução manual.

## Próximos passos (fora do escopo deste MVP de backend)

App Android: fonte React Native em `../app` (APK compilado e assinado fora do servidor —
veja `../app/README.md`). Pacote do roteador em `../router`. Manual completo em
`../docs/MANUAL.md`.
