# Wi-Fi Multi-Tenant — Portal Cativo

Sistema de portal cativo para Wi-Fi de clientes em lojas, baseado em OpenWRT + UnTangled,
com autenticação obrigatória, registro de acessos com integridade garantida (cadeia de hash)
e gestão multi-tenant. Especificação completa: `docs/spec.md` (seções 1–6 aprovadas).

## Estrutura do monorepo

| Diretório | Componente | Status |
|---|---|---|
| `backend/` | API REST multi-tenant (Node.js + Fastify + PostgreSQL) — serve portal, painel e app | ✅ MVP concluído, 41 testes de integração |
| `portal/` | PWA do portal cativo (captura, SMS, sessão) | 🔜 próximo passo |
| `admin/` | Painel administrativo web (React) | planejado |
| `app/` | App Android (React Native, APK assinado) | planejado |
| `router/` | Pacote de provisionamento OpenWRT/UnTangled (chilli, firewall, DNS filtrado) | planejado |

## Backend — como rodar

```bash
cd backend
cp .env.example .env          # ajuste DATABASE_URL, JWT_SECRET e DATA_KEY
docker compose up -d          # PostgreSQL 17
npm install
npm run migrate               # aplica db/schema.sql (partições mensais inclusas)
npm run seed                  # cria admin da rede e imprime o segredo TOTP
npm start                     # http://localhost:3000
npm test                      # 41 testes de integração (PostgreSQL real embutido)
```

Detalhes dos endpoints e garantias (append-only, cadeia de hash, LGPD, expurgo):
veja [backend/README.md](backend/README.md).

## Roadmap

1. **PWA do portal** (`portal/`) — cadastro com foto, verificação SMS, login/PIN,
   status da sessão e aviso de limite; servida pelo próprio backend.
2. Painel React (`admin/`) consumindo `/v1/admin/*`.
3. Pacote de provisionamento do roteador (`router/`).
4. App React Native (`app/`).
