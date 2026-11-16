import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  iniciarBanco, pararBanco, limparBanco, buildApp, criarTenant, FOTO_TESTE,
} from './helpers.js';

let app;
let tenant;

before(async () => {
  await iniciarBanco();
  await limparBanco();
  app = await buildApp();
  tenant = await criarTenant('Loja Auth');
});

after(async () => { await app.close(); await pararBanco(); });

const cadastroBase = () => ({
  nome: 'Maria Silva',
  email: 'maria@example.com',
  telefone: '11987654321',
  senha: 'SenhaForte123',
  pin: '1234',
  foto: FOTO_TESTE,
  consentimento: { aceite: true, termos_versao: '1.0', politica_versao: '1.0' },
});

test('cadastro exige foto', async () => {
  const corpo = cadastroBase(); delete corpo.foto;
  const res = await app.inject({ method: 'POST', url: '/v1/auth/cadastro',
    headers: { 'x-tenant-id': tenant.id }, payload: corpo });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().erro, 'foto_obrigatoria');
});

test('cadastro exige aceite de termos', async () => {
  const corpo = cadastroBase(); delete corpo.consentimento;
  const res = await app.inject({ method: 'POST', url: '/v1/auth/cadastro',
    headers: { 'x-tenant-id': tenant.id }, payload: corpo });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().erro, 'consentimento_obrigatorio');
});

test('cadastro valido envia codigo SMS (gateway dev) e verifica', async () => {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/cadastro',
    headers: { 'x-tenant-id': tenant.id }, payload: cadastroBase() });
  assert.equal(res.statusCode, 201);
  const { sms, id } = res.json();
  assert.ok(id);
  assert.ok(/^\d{6}$/.test(sms.codigo));

  const errado = await app.inject({ method: 'POST', url: '/v1/auth/verificar',
    headers: { 'x-tenant-id': tenant.id }, payload: { telefone: '11987654321', codigo: '000000' } });
  assert.equal(errado.statusCode, 400);
  assert.equal(errado.json().erro, 'codigo_incorreto');

  const ok = await app.inject({ method: 'POST', url: '/v1/auth/verificar',
    headers: { 'x-tenant-id': tenant.id }, payload: { telefone: '11987654321', codigo: sms.codigo } });
  assert.equal(ok.statusCode, 200);
  assert.ok(ok.json().token);
});

test('um telefone admite apenas uma conta', async () => {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/cadastro',
    headers: { 'x-tenant-id': tenant.id }, payload: cadastroBase() });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().erro, 'telefone_ja_cadastrado');
});

test('login recorrente por senha e por PIN', async () => {
  const senha = await app.inject({ method: 'POST', url: '/v1/auth/login',
    headers: { 'x-tenant-id': tenant.id }, payload: { identificador: 'maria@example.com', senha: 'SenhaForte123' } });
  assert.equal(senha.statusCode, 200);
  assert.ok(senha.json().token);

  const pin = await app.inject({ method: 'POST', url: '/v1/auth/login',
    headers: { 'x-tenant-id': tenant.id }, payload: { identificador: '11987654321', pin: '1234' } });
  assert.equal(pin.statusCode, 200);
  assert.ok(pin.json().token);
});

test('limite de tentativas bloqueia conta temporariamente', async () => {
  for (let i = 0; i < 5; i++) {
    const res = await app.inject({ method: 'POST', url: '/v1/auth/login',
      headers: { 'x-tenant-id': tenant.id }, payload: { identificador: 'maria@example.com', senha: 'errada' } });
    assert.equal(res.statusCode, 401);
  }
  const sexto = await app.inject({ method: 'POST', url: '/v1/auth/login',
    headers: { 'x-tenant-id': tenant.id }, payload: { identificador: 'maria@example.com', senha: 'SenhaForte123' } });
  assert.equal(sexto.statusCode, 429);
  assert.equal(sexto.json().erro, 'conta_bloqueada_temporariamente');
});

test('cadastro sem tenant no header e recusado', async () => {
  const res = await app.inject({ method: 'POST', url: '/v1/auth/cadastro', payload: cadastroBase() });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().erro, 'tenant_nao_informado');
});
