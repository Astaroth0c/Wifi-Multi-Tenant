import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  iniciarBanco, pararBanco, limparBanco, buildApp, criarTenant, criarClienteAtivo,
  criarSessaoDireto, criarAdmin, codigoTotp,
} from './helpers.js';

let app;
let tenant;
let cliente;
let sessao;

before(async () => {
  await iniciarBanco();
  await limparBanco();
  app = await buildApp();
  tenant = await criarTenant('Loja Logs');
  cliente = await criarClienteAtivo(tenant.id, { telefone: '+5511966660001' });
  sessao = (await criarSessaoDireto(tenant.id, cliente.id, { mac: 'AA:BB:CC:00:00:01' })).sessao;
});

after(async () => { await app.close(); await pararBanco(); });

const registro = (dominio, acao = 'permitido', categoria = null) => ({
  ts: new Date().toISOString(), tipo: 'dns', dominio, acao, categoria, bytes: 120,
});

test('roteador ingere logs com cadeia de hash', async () => {
  const res = await app.inject({ method: 'POST', url: '/v1/roteador/logs',
    headers: { 'x-router-token': tenant.router_token },
    payload: { sessao_id: sessao.id, registros: [
      registro('example.com'),
      registro('outro.com.br'),
      registro('site-adulto.com', 'bloqueado', 'adulto'),
    ] } });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().inseridos, 3);
});

test('router token invalido e recusado', async () => {
  const res = await app.inject({ method: 'POST', url: '/v1/roteador/logs',
    headers: { 'x-router-token': 'invalido' },
    payload: { sessao_id: sessao.id, registros: [registro('x.com')] } });
  assert.equal(res.statusCode, 401);
});

test('cadeia de hash reporta integridade', async () => {
  const { criarAdmin: admin, codigoTotp: totp } = await import('./helpers.js');
  const { admin: adm, senha, totpSecret } = await admin({ papel: 'rede' });
  const login = await app.inject({ method: 'POST', url: '/v1/admin/login',
    payload: { email: adm.email, senha, codigo_totp: totp(totpSecret) } });
  const tokenAdmin = login.json().token;

  const res = await app.inject({ method: 'GET', url: `/v1/admin/logs/cadeia?tenant_id=${tenant.id}`,
    headers: { authorization: `Bearer ${tokenAdmin}` } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.integra, true);
  assert.equal(body.verificados, 3);
});

test('tentativa bloqueada registra dominio e categoria', async () => {
  const { pool } = await import('../src/db.js');
  const r = await pool.query(
    `select dominio, categoria, acao from logs_acesso
      where sessao_id = $1 and acao = 'bloqueado'`, [sessao.id]);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].dominio, 'site-adulto.com');
  assert.equal(r.rows[0].categoria, 'adulto');
});

test('alteracao direta em logs e bloqueada (append-only)', async () => {
  const { pool } = await import('../src/db.js');
  await assert.rejects(
    () => pool.query(`update logs_acesso set dominio = 'hackeado.com' where sessao_id = $1`, [sessao.id]),
    /append-only/,
  );
  await assert.rejects(
    () => pool.query(`delete from logs_acesso where sessao_id = $1`, [sessao.id]),
    /append-only/,
  );
});

test('cadeia quebrada e detectada pela verificacao', async () => {
  const { pool } = await import('../src/db.js');
  await pool.query(
    `insert into logs_acesso (tenant_id, sessao_id, ts, tipo, dominio, acao, hash_anterior, hash_proprio)
     values ($1,$2, now(), 'dns', 'forjado.com', 'permitido', 'hash-falso', 'hash-falso')`,
    [tenant.id, sessao.id]);
  const { verificarCadeia } = await import('../src/routes/roteador.js');
  const resultado = await verificarCadeia(tenant.id);
  assert.equal(resultado.integra, false);
  assert.ok(resultado.primeiro_incidente);
});

test('particao mensal e criada sob demanda para datas futuras', async () => {
  const { pool } = await import('../src/db.js');
  const futuro = new Date(Date.now() + 40 * 24 * 3600 * 1000);
  const res = await app.inject({ method: 'POST', url: '/v1/roteador/logs',
    headers: { 'x-router-token': tenant.router_token },
    payload: { sessao_id: sessao.id, registros: [{ ...registro('futuro.com'), ts: futuro.toISOString() }] } });
  assert.equal(res.statusCode, 201);
  const y = futuro.getUTCFullYear(); const m = String(futuro.getUTCMonth() + 1).padStart(2, '0');
  const r = await pool.query(`select to_regclass('public.logs_acesso_${y}${m}') as t`);
  assert.ok(r.rows[0].t);
});

test('roteador consulta autorizacoes de sessoes recentes', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/roteador/autorizacoes',
    headers: { 'x-router-token': tenant.router_token } });
  assert.equal(res.statusCode, 200);
  const lista = res.json().autorizacoes;
  assert.ok(Array.isArray(lista));
  const minha = lista.find((a) => a.sessao_id === sessao.id);
  assert.ok(minha, 'sessao recente deve estar na lista');
  assert.equal(minha.mac, 'AA:BB:CC:00:00:01');
  assert.ok(minha.session_timeout > 0);
});
