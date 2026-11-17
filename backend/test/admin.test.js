import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  iniciarBanco, pararBanco, limparBanco, buildApp, criarTenant, criarClienteAtivo,
  criarAdmin, codigoTotp, FOTO_TESTE,
} from './helpers.js';

let app;
let tenant;
let adminInfo;
let tokenAdmin;

async function loginAdmin() {
  const login = await app.inject({ method: 'POST', url: '/v1/admin/login',
    payload: { email: adminInfo.admin.email, senha: adminInfo.senha, codigo_totp: codigoTotp(adminInfo.totpSecret) } });
  return login;
}

before(async () => {
  await iniciarBanco();
  await limparBanco();
  app = await buildApp();
  tenant = await criarTenant('Loja Admin');
  adminInfo = await criarAdmin({ papel: 'loja', tenantId: tenant.id, email: 'loja@teste.local' });
});

after(async () => { await app.close(); await pararBanco(); });

test('login admin exige senha e TOTP validos', async () => {
  const semTotp = await app.inject({ method: 'POST', url: '/v1/admin/login',
    payload: { email: adminInfo.admin.email, senha: adminInfo.senha } });
  assert.equal(semTotp.statusCode, 400);

  const totpErrado = await app.inject({ method: 'POST', url: '/v1/admin/login',
    payload: { email: adminInfo.admin.email, senha: adminInfo.senha, codigo_totp: '000000' } });
  assert.equal(totpErrado.statusCode, 401);
  assert.equal(totpErrado.json().erro, 'totp_invalido');

  const senhaErrada = await app.inject({ method: 'POST', url: '/v1/admin/login',
    payload: { email: adminInfo.admin.email, senha: 'errada', codigo_totp: codigoTotp(adminInfo.totpSecret) } });
  assert.equal(senhaErrada.statusCode, 401);

  const ok = await loginAdmin();
  assert.equal(ok.statusCode, 200);
  tokenAdmin = ok.json().token;
  assert.equal(ok.json().papel, 'loja');
});

test('resumo do painel retorna contadores e cadeia integra', async () => {
  await criarClienteAtivo(tenant.id, { telefone: '+5511933330001', nome: 'Maria Resumo' });
  const r = await app.inject({ method: 'GET', url: '/v1/admin/resumo',
    headers: { authorization: `Bearer ${tokenAdmin}` } });
  assert.equal(r.statusCode, 200);
  const corpo = r.json();
  assert.ok(corpo.clientes.total >= 1);
  assert.ok(corpo.clientes.ativos >= 1);
  assert.equal(typeof corpo.sessoes_ativas, 'number');
  assert.equal(typeof corpo.hoje.logs, 'number');
  assert.equal(typeof corpo.hoje.bloqueios, 'number');
  assert.ok(corpo.cadeia);
  assert.equal(corpo.cadeia.integra, true);
  assert.equal(corpo.tenants, null);
});

test('ficha do cliente com exportacao CSV e PDF', async () => {
  const cliente = await criarClienteAtivo(tenant.id, { telefone: '+5511955550001', nome: 'Jose Souza' });
  const csv = await app.inject({ method: 'GET', url: `/v1/admin/clientes/${cliente.id}/exportar?formato=csv`,
    headers: { authorization: `Bearer ${tokenAdmin}` } });
  assert.equal(csv.statusCode, 200);
  assert.match(csv.body, /\[Cliente\]/);
  assert.match(csv.body, /Jose Souza/);

  const pdf = await app.inject({ method: 'GET', url: `/v1/admin/clientes/${cliente.id}/exportar?formato=pdf`,
    headers: { authorization: `Bearer ${tokenAdmin}` } });
  assert.equal(pdf.statusCode, 200);
  assert.ok(pdf.body.startsWith('%PDF'));
});

test('suspensao de cliente invalida token e bloqueia login', async () => {
  const cliente = await criarClienteAtivo(tenant.id, { telefone: '+5511944440001', pin: '1111' });
  const loginCliente = await app.inject({ method: 'POST', url: '/v1/auth/login',
    headers: { 'x-tenant-id': tenant.id }, payload: { identificador: '5511944440001', pin: '1111' } });
  const tokenCliente = loginCliente.json().token;

  const suspender = await app.inject({ method: 'PATCH', url: `/v1/admin/clientes/${cliente.id}`,
    headers: { authorization: `Bearer ${tokenAdmin}` }, payload: { status: 'suspenso' } });
  assert.equal(suspender.statusCode, 200);
  assert.equal(suspender.json().status, 'suspenso');

  const comToken = await app.inject({ method: 'GET', url: '/v1/sessoes/atual',
    headers: { authorization: `Bearer ${tokenCliente}` } });
  assert.equal(comToken.statusCode, 401);

  const login = await app.inject({ method: 'POST', url: '/v1/auth/login',
    headers: { 'x-tenant-id': tenant.id }, payload: { identificador: '5511944440001', pin: '1111' } });
  assert.equal(login.statusCode, 403);
  assert.equal(login.json().erro, 'conta_suspensa');
});

test('revogacao de token admin invalida sessao atual', async () => {
  const ok = await loginAdmin();
  const token = ok.json().token;
  const antes = await app.inject({ method: 'GET', url: '/v1/admin/sessoes/ao-vivo',
    headers: { authorization: `Bearer ${token}` } });
  assert.equal(antes.statusCode, 200);

  await app.inject({ method: 'POST', url: '/v1/admin/tokens/revogar',
    headers: { authorization: `Bearer ${token}` } });

  const depois = await app.inject({ method: 'GET', url: '/v1/admin/sessoes/ao-vivo',
    headers: { authorization: `Bearer ${token}` } });
  assert.equal(depois.statusCode, 401);
  tokenAdmin = (await loginAdmin()).json().token;
});

test('acoes sensiveis ficam registradas na auditoria', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/admin/auditoria',
    headers: { authorization: `Bearer ${tokenAdmin}` } });
  assert.equal(res.statusCode, 200);
  const acoes = res.json().registros.map((r) => r.acao);
  assert.ok(acoes.includes('login_admin'));
  assert.ok(acoes.includes('suspender_cliente'));
  assert.ok(acoes.includes('exportar_ficha'));
});

test('configuracoes do tenant sao atualizaveis', async () => {
  const res = await app.inject({ method: 'PUT', url: '/v1/admin/config',
    headers: { authorization: `Bearer ${tokenAdmin}` },
    payload: { configuracoes: { limite_diario_minutos: 90, ssid: 'WiFi-Loja' } } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().configuracoes.limite_diario_minutos, 90);

  const invalido = await app.inject({ method: 'PUT', url: '/v1/admin/config',
    headers: { authorization: `Bearer ${tokenAdmin}` },
    payload: { configuracoes: { limite_diario_minutos: 9999 } } });
  assert.equal(invalido.statusCode, 400);
});

if (existsSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'admin', 'dist', 'index.html'))) {
  test('painel admin e servido em /admin/', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/' });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /id="raiz"/);
    const redirect = await app.inject({ method: 'GET', url: '/admin' });
    assert.equal(redirect.statusCode, 302);
  });
}
