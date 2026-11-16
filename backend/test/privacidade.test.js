import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  iniciarBanco, pararBanco, limparBanco, buildApp, criarTenant, criarClienteAtivo,
  criarSessaoDireto,
} from './helpers.js';

let app;
let tenant;
let cliente;
let token;

before(async () => {
  await iniciarBanco();
  await limparBanco();
  app = await buildApp();
  tenant = await criarTenant('Loja LGPD');
  cliente = await criarClienteAtivo(tenant.id, { telefone: '+5511922220001', pin: '9999' });
  const login = await app.inject({ method: 'POST', url: '/v1/auth/login',
    headers: { 'x-tenant-id': tenant.id }, payload: { identificador: '5511922220001', pin: '9999' } });
  token = login.json().token;
  const sessao = (await criarSessaoDireto(tenant.id, cliente.id, { mac: 'CC:CC:CC:00:00:03' })).sessao;
  await app.inject({ method: 'POST', url: '/v1/roteador/logs',
    headers: { 'x-router-token': tenant.router_token },
    payload: { sessao_id: sessao.id, registros: [
      { tipo: 'dns', dominio: 'exemplo.com', acao: 'permitido', bytes: 500 },
    ] } });
});

after(async () => { await app.close(); await pararBanco(); });

test('titular acessa seus dados (LGPD)', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/privacidade/meus-dados',
    headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 200);
  const dados = res.json();
  assert.equal(dados.usuario.telefone, '+5511922220001');
  assert.equal(dados.usuario.nome, 'Cliente Teste');
  assert.equal(dados.logs.total, 1);
});

test('exclusao do titular anonimiza dados e preserva logs', async () => {
  const res = await app.inject({ method: 'DELETE', url: '/v1/privacidade/meus-dados',
    headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().removido, true);

  const { pool } = await import('../src/db.js');
  const r = await pool.query('select * from usuarios where id = $1', [cliente.id]);
  const u = r.rows[0];
  assert.equal(u.status, 'removido');
  assert.equal(u.nome, 'Titular removido');
  assert.equal(u.email, null);
  assert.equal(u.telefone_enc, null);
  assert.equal(u.foto_enc, null);
  assert.equal(u.senha_hash, null);

  const logs = await pool.query(
    `select count(*)::int as t from logs_acesso l join sessoes s on s.id = l.sessao_id
      where s.usuario_id = $1`, [cliente.id]);
  assert.equal(logs.rows[0].t, 1);

  const tokenMorto = await app.inject({ method: 'GET', url: '/v1/privacidade/meus-dados',
    headers: { authorization: `Bearer ${token}` } });
  assert.equal(tokenMorto.statusCode, 401);

  const aud = await pool.query(
    `select acao from auditoria_admin where alvo = $1`, [cliente.id]);
  assert.ok(aud.rows.some((x) => x.acao === 'lgpd_exclusao_titular'));
});
