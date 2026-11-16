-- Portal Cativo Wi-Fi Multi-Tenant — schema PostgreSQL
create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  configuracoes jsonb not null default '{}',
  identidade_visual jsonb,
  gateway_sms jsonb not null default '{"provedor":"dev"}',
  router_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  nome text not null,
  email text,
  telefone_enc text,
  telefone_hash text not null unique,
  senha_hash text,
  pin_hash text,
  foto_enc text,
  consentimento jsonb not null,
  status text not null default 'pendente'
    check (status in ('pendente','ativo','suspenso','removido')),
  token_version integer not null default 0,
  tentativas_login integer not null default 0,
  bloqueado_ate timestamptz,
  criado_em timestamptz not null default now(),
  ultimo_login timestamptz
);
create index if not exists idx_usuarios_tenant on usuarios(tenant_id);

create table if not exists dispositivos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  usuario_id uuid not null references usuarios(id),
  mac text not null unique,
  fabricante text,
  modelo text,
  user_agent text,
  primeiro_visto timestamptz not null default now(),
  ultimo_visto timestamptz not null default now()
);
create index if not exists idx_dispositivos_usuario on dispositivos(usuario_id);

create table if not exists sessoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  usuario_id uuid not null references usuarios(id),
  dispositivo_id uuid not null references dispositivos(id),
  inicio timestamptz not null default now(),
  fim timestamptz,
  tempo_total_s integer not null default 0,
  dados_up bigint not null default 0,
  dados_down bigint not null default 0,
  ip_interno inet,
  encerrada_por text check (encerrada_por in ('logout','expiracao','limite','admin'))
);
create index if not exists idx_sessoes_usuario on sessoes(usuario_id, inicio);
create index if not exists idx_sessoes_tenant_abertas on sessoes(tenant_id) where fim is null;

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  email text not null unique,
  papel text not null check (papel in ('loja','rede')),
  senha_hash text not null,
  totp_secret text not null,
  token_version integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists auditoria_admin (
  id bigint generated always as identity primary key,
  admin_id uuid references admin_users(id),
  tenant_id uuid,
  acao text not null,
  alvo text,
  detalhes jsonb,
  ts timestamptz not null default now(),
  ip inet
);
create index if not exists idx_auditoria_ts on auditoria_admin(ts);

create table if not exists sms_codigos (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references tenants(id),
  telefone_hash text not null,
  codigo_hash text not null,
  tentativas integer not null default 0,
  usado boolean not null default false,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now()
);
create index if not exists idx_sms_telefone on sms_codigos(telefone_hash, criado_em);

create table if not exists log_chain_state (
  tenant_id uuid primary key references tenants(id),
  ultimo_hash text not null,
  ultimo_id bigint,
  atualizado_em timestamptz not null default now()
);

-- ===== logs_acesso: append-only, particionada por mês =====
create sequence if not exists logs_acesso_id_seq;

create table if not exists logs_acesso (
  id bigint not null default nextval('logs_acesso_id_seq'),
  tenant_id uuid not null references tenants(id),
  sessao_id uuid not null references sessoes(id),
  ts timestamptz not null,
  tipo text not null check (tipo in ('dns','http')),
  dominio text not null,
  url text,
  categoria text,
  acao text not null check (acao in ('permitido','bloqueado')),
  ip_destino inet,
  bytes bigint not null default 0,
  hash_anterior text not null,
  hash_proprio text not null,
  primary key (id, ts)
) partition by range (ts);

create or replace function logs_append_only() returns trigger as $$
begin
  raise exception 'logs_acesso e append-only: alteracao/apagamento direto nao permitido';
end;
$$ language plpgsql;

create or replace function criar_particao_logs(mes date) returns text as $$
declare
  nome text := 'logs_acesso_' || to_char(mes, 'YYYYMM');
  inicio date := date_trunc('month', mes)::date;
begin
  if to_regclass('public.' || nome) is null then
    execute format(
      'create table %I partition of logs_acesso for values from (%L) to (%L)',
      nome, inicio, inicio + interval '1 month');
    execute format(
      'create trigger trg_append_only_%I before update or delete on %I
         for each row execute function logs_append_only()', nome, nome);
  end if;
  return nome;
end;
$$ language plpgsql;

select criar_particao_logs(date_trunc('month', now())::date);
select criar_particao_logs((date_trunc('month', now())::date + interval '1 month')::date);
