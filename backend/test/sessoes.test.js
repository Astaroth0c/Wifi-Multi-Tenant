import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  iniciarBanco, pararBanco, limparBanco, buildApp, criarTenant, criarClienteAtivo, criarSessaoDireto,
} from './helpers.js';

let app;
let tenant;
let cliente;
let token;

before(async () => {
  await iniciarBanco();
  await limparBanco();
  app = await buildApp();
  tenant = await criarTenant('Loja Sessoes');
  cliente = await criarClienteAtivo(tenant.id, { telefone: '+5511977770001', pin: '4321' });
  const login = await app.inject({ method: 'POST', url: '/v1/auth/login',
    headers: { 'x-tenant-id': tenant.id }, payload: { identificador: '5511977770001', pin: '4321' } });
  token = login.json().token;
});

after(async () => { await app.close(); await pararBanco(); });

test('abre sessao vinculada a MAC e IP', async () => {
  const res = await app.inject({ method: 'POST', url: '/v1/sessoes',
    headers: { authorization: `Bearer ${token}` },
    payload: { mac: 'AA:BB:CC:DD:EE:01', ip_interno: '192.168.0.50', user_agent: 'TestUA/1.0' } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.nova, true);
  assert.ok(body.sessao.id);
  assert.ok(body.tempo_restante_s > 0 && body.tempo_restante_s <= 120 * 60);
});

test('sessao existente e reutilizada (sem duplicar)', async () => {
  const res = await app.inject({ method: 'POST', url: '/v1/sessoes',
    headers: { authorization: `Bearer ${token}` },
    payload: { mac: 'AA:BB:CC:DD:EE:01', ip_interno: '192.168.0.50' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().nova, false);
});

test('reconexao automatica por MAC conhecido no mesmo dia', async () => {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/reconectar',
    headers: { 'x-tenant-id': tenant.id },
    payload: { mac: 'AA:BB:CC:DD:EE:01', ip_interno: '192.168.0.51' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().reconectado, true);
  assert.ok(res.json().token);
});

test('reconexao com MAC desconhecido e recusada', async () => {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/reconectar',
    headers: { 'x-tenant-id': tenant.id },
    payload: { mac: '11:22:33:44:55:66' } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().erro, 'reconexao_nao_permitida');
});

test('sessao encerra ao esgotar limite diario', async () => {
  const { pool } = await import('../src/db.js');
  await pool.query(
    `update tenants set configuracoes = '{"limite_diario_minutos":1}' where id = $1`, [tenant.id]);
  await pool.query(
    `update sessoes set inicio = now() - interval '2 minutes' where usuario_id = $1 and fim is null`,
    [cliente.id]);
  const res = await app.inject({ method: 'POST', url: '/v1/sessoes',
    headers: { authorization: `Bearer ${token}` },
    payload: { mac: 'AA:BB:CC:DD:EE:01' } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().erro, 'limite_atingido');
  const r = await pool.query(
    `select encerrada_por from sessoes where usuario_id = $1 and fim is not null
      order by fim desc limit 1`, [cliente.id]);
  assert.equal(r.rows[0].encerrada_por, 'limite');
  await pool.query(`update tenants set configuracoes = '{}' where id = $1`, [tenant.id]);
});

test('sessao ativa ha mais de 12h expira', async () => {
  const { pool } = await import('../src/db.js');
  await pool.query(
    `update sessoes set fim = null, encerrada_por = null,
       inicio = now() - interval '13 hours'
     where usuario_id = $1`, [cliente.id]);
  const res = await app.inject({ method: 'GET', url: '/v1/sessoes/atual',
    headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().erro, 'sessao_expirada');
  const r = await pool.query(
    'select encerrada_por from sessoes where usuario_id = $1 order by inicio desc limit 1', [cliente.id]);
  assert.equal(r.rows[0].encerrada_por, 'expiracao');
});

test('logout encerra a sessao', async () => {
  const { pool } = await import('../src/db.js');
  await pool.query(`update sessoes set tempo_total_s = 0 where usuario_id = $1`, [cliente.id]);
  await app.inject({ method: 'POST', url: '/v1/sessoes',
    headers: { authorization: `Bearer ${token}` }, payload: { mac: 'AA:BB:CC:DD:EE:01' } });
  const res = await app.inject({ method: 'POST', url: '/v1/sessoes/encerrar',
    headers: { authorization: `Bearer ${token}` }, payload: { dados_up: 100, dados_down: 200 } });
  assert.equal(res.statusCode, 200);
  const r = await pool.query(
    `select encerrada_por, dados_up, dados_down from sessoes
      where usuario_id = $1 and fim is not null order by fim desc limit 1`, [cliente.id]);
  assert.equal(r.rows[0].encerrada_por, 'logout');
  assert.equal(Number(r.rows[0].dados_up), 100);
});
