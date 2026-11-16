import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  iniciarBanco, pararBanco, limparBanco, buildApp, criarTenant, criarClienteAtivo,
  criarSessaoDireto,
} from './helpers.js';

let app;
let tenant;
let cliente;
let sessao;

before(async () => {
  await iniciarBanco();
  await limparBanco();
  app = await buildApp();
  tenant = await criarTenant('Loja Expurgo');
  cliente = await criarClienteAtivo(tenant.id, { telefone: '+5511911110001' });
  sessao = (await criarSessaoDireto(tenant.id, cliente.id, { mac: 'DD:DD:DD:00:00:04' })).sessao;
});

after(async () => { await app.close(); await pararBanco(); });

test('expurgo remove particoes antigas, preserva recentes e audita', async () => {
  const { pool } = await import('../src/db.js');
  await pool.query(`select criar_particao_logs('2024-01-01'::date)`);
  await pool.query(
    `insert into logs_acesso (tenant_id, sessao_id, ts, tipo, dominio, acao, hash_anterior, hash_proprio)
     values ($1,$2,'2024-01-15T10:00:00Z','dns','antigo.com','permitido','a','b')`,
    [tenant.id, sessao.id]);
  await app.inject({ method: 'POST', url: '/v1/roteador/logs',
    headers: { 'x-router-token': tenant.router_token },
    payload: { sessao_id: sessao.id, registros: [
      { tipo: 'dns', dominio: 'recente.com', acao: 'permitido', bytes: 10 },
    ] } });

  const { executarExpurgo } = await import('../src/services/expurgo.js');
  const removidas = await executarExpurgo(365);
  assert.ok(removidas.includes('logs_acesso_202401'));

  const antigos = await pool.query(`select count(*)::int as t from logs_acesso where dominio = 'antigo.com'`);
  assert.equal(antigos.rows[0].t, 0);
  const recentes = await pool.query(`select count(*)::int as t from logs_acesso where dominio = 'recente.com'`);
  assert.equal(recentes.rows[0].t, 1);

  const aud = await pool.query(`select acao from auditoria_admin where acao = 'expurgo_logs'`);
  assert.ok(aud.rows.length >= 1);
});
