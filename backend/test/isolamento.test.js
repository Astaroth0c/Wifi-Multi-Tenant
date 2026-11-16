import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  iniciarBanco, pararBanco, limparBanco, buildApp, criarTenant, criarClienteAtivo,
  criarSessaoDireto, criarAdmin, codigoTotp,
} from './helpers.js';

let app;
let tenantA;
let tenantB;
let clienteA;
let clienteB;
let sessaoB;
let tokenAdminLojaA;
let tokenAdminRede;

before(async () => {
  await iniciarBanco();
  await limparBanco();
  app = await buildApp();
  tenantA = await criarTenant('Loja A');
  tenantB = await criarTenant('Loja B');
  clienteA = await criarClienteAtivo(tenantA.id, { telefone: '+5511933330001', nome: 'Cliente A' });
  clienteB = await criarClienteAtivo(tenantB.id, { telefone: '+5511933330002', nome: 'Cliente B' });
  sessaoB = (await criarSessaoDireto(tenantB.id, clienteB.id, { mac: 'BB:BB:BB:00:00:02' })).sessao;

  const loja = await criarAdmin({ papel: 'loja', tenantId: tenantA.id, email: 'lojaA@teste.local' });
  const rede = await criarAdmin({ papel: 'rede', email: 'rede@teste.local' });
  const loginLoja = await app.inject({ method: 'POST', url: '/v1/admin/login',
    payload: { email: loja.admin.email, senha: loja.senha, codigo_totp: codigoTotp(loja.totpSecret) } });
  const loginRede = await app.inject({ method: 'POST', url: '/v1/admin/login',
    payload: { email: rede.admin.email, senha: rede.senha, codigo_totp: codigoTotp(rede.totpSecret) } });
  tokenAdminLojaA = loginLoja.json().token;
  tokenAdminRede = loginRede.json().token;
});

after(async () => { await app.close(); await pararBanco(); });

test('admin da loja A ve apenas clientes do proprio tenant', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/admin/clientes',
    headers: { authorization: `Bearer ${tokenAdminLojaA}` } });
  assert.equal(res.statusCode, 200);
  const ids = res.json().clientes.map((c) => c.id);
  assert.ok(ids.includes(clienteA.id));
  assert.ok(!ids.includes(clienteB.id));
});

test('admin da loja A nao acessa ficha de cliente da loja B', async () => {
  const res = await app.inject({ method: 'GET', url: `/v1/admin/clientes/${clienteB.id}`,
    headers: { authorization: `Bearer ${tokenAdminLojaA}` } });
  assert.equal(res.statusCode, 404);
});

test('admin da loja A nao filtra logs de outro tenant', async () => {
  const res = await app.inject({ method: 'GET', url: `/v1/admin/logs?tenant_id=${tenantB.id}`,
    headers: { authorization: `Bearer ${tokenAdminLojaA}` } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().erro, 'permissao_negada');
});

test('admin da loja A nao cria tenants', async () => {
  const res = await app.inject({ method: 'POST', url: '/v1/admin/tenants',
    headers: { authorization: `Bearer ${tokenAdminLojaA}` }, payload: { nome: 'Nova Loja' } });
  assert.equal(res.statusCode, 403);
});

test('admin da loja A nao executa expurgo global', async () => {
  const res = await app.inject({ method: 'POST', url: '/v1/admin/expurgo',
    headers: { authorization: `Bearer ${tokenAdminLojaA}` }, payload: {} });
  assert.equal(res.statusCode, 403);
});

test('admin da rede acessa qualquer tenant', async () => {
  const res = await app.inject({ method: 'GET', url: `/v1/admin/clientes?tenant_id=${tenantB.id}`,
    headers: { authorization: `Bearer ${tokenAdminRede}` } });
  assert.equal(res.statusCode, 200);
  const ids = res.json().clientes.map((c) => c.id);
  assert.ok(ids.includes(clienteB.id));
  assert.ok(!ids.includes(clienteA.id));
});

test('sessao ao vivo respeita escopo do tenant', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/admin/sessoes/ao-vivo',
    headers: { authorization: `Bearer ${tokenAdminLojaA}` } });
  assert.equal(res.statusCode, 200);
  const ids = res.json().sessoes.map((s) => s.usuario_id);
  assert.ok(!ids.includes(clienteB.id));
});

test('roteador do tenant A nao ingere logs em sessao do tenant B', async () => {
  const res = await app.inject({ method: 'POST', url: '/v1/roteador/logs',
    headers: { 'x-router-token': tenantA.router_token },
    payload: { sessao_id: sessaoB.id, registros: [{ tipo: 'dns', dominio: 'x.com', acao: 'permitido' }] } });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().erro, 'sessao_nao_encontrada');
});

test('cliente do tenant A nao ve dados do tenant B', async () => {
  const login = await app.inject({ method: 'POST', url: '/v1/auth/login',
    headers: { 'x-tenant-id': tenantA.id },
    payload: { identificador: '5511933330001', senha: 'SenhaForte123' } });
  const tokenA = login.json().token;
  const res = await app.inject({ method: 'GET', url: '/v1/privacidade/meus-dados',
    headers: { authorization: `Bearer ${tokenA}` } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().usuario.nome, 'Cliente A');
  assert.ok(!JSON.stringify(res.json()).includes('Cliente B'));
});

test('admin da rede cria tenant e isolamento se mantem', async () => {
  const res = await app.inject({ method: 'POST', url: '/v1/admin/tenants',
    headers: { authorization: `Bearer ${tokenAdminRede}` },
    payload: { nome: 'Loja C', cnpj: '12345678000199' } });
  assert.equal(res.statusCode, 201);
  assert.ok(res.json().router_token);
});
