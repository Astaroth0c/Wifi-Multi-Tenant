import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarBanco, pararBanco, buildApp } from './helpers.js';

let app;

before(async () => {
  await iniciarBanco();
  app = await buildApp();
});

after(async () => { await app.close(); await pararBanco(); });

test('health check responde com banco saudavel', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/health' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok', banco: true });
});
