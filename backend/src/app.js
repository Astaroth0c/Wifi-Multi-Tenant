import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { ErroApi } from './services/sessoes.js';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import sessaoRoutes from './routes/sessoes.js';
import roteadorRoutes from './routes/roteador.js';
import adminRoutes from './routes/admin.js';
import privacidadeRoutes from './routes/privacidade.js';
import portalRoutes from './routes/portal.js';

export async function buildApp(opts = {}) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 4 * 1024 * 1024 });

  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(rateLimit, { global: false, max: 300, timeWindow: '1 minute' });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ErroApi) {
      return reply.code(err.statusCode).send({ erro: err.codigo, ...err.extras });
    }
    if (err.statusCode === 429) {
      return reply.code(429).send({ erro: 'muitas_tentativas' });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ erro: err.code || 'requisicao_invalida', detalhe: err.message });
    }
    req.log?.error(err);
    if (config.env !== 'production') console.error('[erro_interno]', err);
    return reply.code(500).send({ erro: 'erro_interno' });
  });

  await app.register(healthRoutes, { prefix: '/v1' });
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(sessaoRoutes, { prefix: '/v1' });
  await app.register(roteadorRoutes, { prefix: '/v1/roteador' });
  await app.register(adminRoutes, { prefix: '/v1/admin' });
  await app.register(privacidadeRoutes, { prefix: '/v1/privacidade' });
  await app.register(portalRoutes, { prefix: '/v1/portal' });

  const dirRaiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dirPortal = process.env.PORTAL_DIR || join(dirRaiz, '..', 'portal');
  if (existsSync(join(dirPortal, 'index.html'))) {
    await app.register(async (instance) => {
      await instance.register(fastifyStatic, { root: dirPortal, prefix: '/portal/' });
    });
    app.get('/', async (req, reply) => reply.redirect('/portal/'));
  }

  const dirAdmin = process.env.ADMIN_DIR || join(dirRaiz, '..', 'admin', 'dist');
  if (existsSync(join(dirAdmin, 'index.html'))) {
    await app.register(async (instance) => {
      await instance.register(fastifyStatic, { root: dirAdmin, prefix: '/admin/', index: 'index.html' });
    });
    app.get('/admin', async (req, reply) => reply.redirect('/admin/'));
  }

  return app;
}
