import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  iniciarBanco, pararBanco, limparBanco, buildApp, criarTenant,
} from './helpers.js';

let app;
let tenant;

before(async () => {
  await iniciarBanco();
  await limparBanco();
  app = await buildApp();
  tenant = await criarTenant('Loja Portal', { ssid: 'WiFi-Loja', limite_diario_minutos: 90 });
});

after(async () => { await app.close(); await pararBanco(); });

test('config publica do portal retorna dados do tenant', async () => {
  const res = await app.inject({ method: 'GET', url: `/v1/portal/config?tenant_id=${tenant.id}` });
  assert.equal(res.statusCode, 200);
  const corpo = res.json();
  assert.equal(corpo.nome, 'Loja Portal');
  assert.equal(corpo.ssid, 'WiFi-Loja');
  assert.equal(corpo.limite_diario_minutos, 90);
  assert.ok(corpo.aviso.includes('Marco Civil'));
});

test('config sem tenant_id e recusada; tenant invalido da 404', async () => {
  const sem = await app.inject({ method: 'GET', url: '/v1/portal/config' });
  assert.equal(sem.statusCode, 400);
  const invalido = await app.inject({ method: 'GET', url: '/v1/portal/config?tenant_id=00000000-0000-0000-0000-000000000000' });
  assert.equal(invalido.statusCode, 404);
});

if (existsSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'portal', 'index.html'))) {
  test('PWA do portal e servido em /portal/', async () => {
    const res = await app.inject({ method: 'GET', url: '/portal/' });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /id="tela-boas-vindas"/);
    const js = await app.inject({ method: 'GET', url: '/portal/app.js' });
    assert.equal(js.statusCode, 200);
    const manifest = await app.inject({ method: 'GET', url: '/portal/manifest.webmanifest' });
    assert.equal(manifest.statusCode, 200);
  });

  test('raiz redireciona para o portal', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, '/portal/');
  });
}
