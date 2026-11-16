import { query, withTransaction } from '../db.js';
import { calcularHash, hashGenesis } from '../services/hashchain.js';
import { garantirParticao } from '../services/expurgo.js';
import { ErroApi } from '../services/sessoes.js';

export async function ingerirLogs(client, tenantId, sessaoId, registros) {
  const estado = await client.query(
    'select ultimo_hash, ultimo_id from log_chain_state where tenant_id = $1 for update',
    [tenantId],
  );
  let anterior = estado.rows[0]?.ultimo_hash ?? hashGenesis(tenantId);
  let ultimoId = estado.rows[0]?.ultimo_id ?? null;
  let inseridos = 0;

  for (const reg of registros) {
    const ts = reg.ts ? new Date(reg.ts) : new Date();
    if (Number.isNaN(ts.getTime())) throw new ErroApi(400, 'ts_invalido');
    await garantirParticao(client, ts);
    const hashProprio = calcularHash(anterior, {
      tenant_id: tenantId,
      sessao_id: sessaoId,
      ts,
      tipo: reg.tipo,
      dominio: reg.dominio,
      url: reg.url,
      categoria: reg.categoria,
      acao: reg.acao,
      ip_destino: reg.ip_destino,
      bytes: reg.bytes,
    });
    const r = await client.query(
      `insert into logs_acesso
         (tenant_id, sessao_id, ts, tipo, dominio, url, categoria, acao, ip_destino, bytes, hash_anterior, hash_proprio)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [tenantId, sessaoId, ts, reg.tipo, reg.dominio, reg.url ?? null, reg.categoria ?? null,
        reg.acao, reg.ip_destino ?? null, reg.bytes ?? 0, anterior, hashProprio],
    );
    anterior = hashProprio;
    ultimoId = r.rows[0].id;
    inseridos += 1;
  }

  await client.query(
    `insert into log_chain_state (tenant_id, ultimo_hash, ultimo_id, atualizado_em)
     values ($1,$2,$3, now())
     on conflict (tenant_id) do update set
       ultimo_hash = excluded.ultimo_hash,
       ultimo_id = excluded.ultimo_id,
       atualizado_em = now()`,
    [tenantId, anterior, ultimoId],
  );
  return inseridos;
}

export async function verificarCadeia(tenantId) {
  let anterior = hashGenesis(tenantId);
  let ultimoId = 0;
  let verificados = 0;
  for (;;) {
    const r = await query(
      `select id, tenant_id, sessao_id, ts, tipo, dominio, url, categoria, acao, ip_destino, bytes, hash_anterior, hash_proprio
         from logs_acesso
        where tenant_id = $1 and id > $2
        order by id asc limit 1000`,
      [tenantId, ultimoId],
    );
    if (!r.rows.length) break;
    for (const row of r.rows) {
      const esperado = calcularHash(anterior, row);
      if (row.hash_anterior !== anterior || row.hash_proprio !== esperado) {
        return { integra: false, verificados, primeiro_incidente: { id: row.id, ts: row.ts } };
      }
      anterior = row.hash_proprio;
      ultimoId = row.id;
      verificados += 1;
    }
    if (r.rows.length < 1000) break;
  }
  return { integra: true, verificados, primeiro_incidente: null };
}

export default async function roteadorRoutes(app) {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/v1/roteador')) return;
    const token = req.headers['x-router-token'];
    if (!token) return reply.code(401).send({ erro: 'router_token_ausente' });
    const r = await query('select * from tenants where router_token = $1 and ativo = true', [token]);
    if (!r.rows[0]) return reply.code(401).send({ erro: 'router_token_invalido' });
    req.tenant = r.rows[0];
  });

  app.post('/logs', async (req, reply) => {
    const { sessao_id, registros } = req.body || {};
    if (!sessao_id || !Array.isArray(registros) || registros.length === 0) {
      throw new ErroApi(400, 'payload_invalido');
    }
    if (registros.length > 1000) throw new ErroApi(400, 'lote_muito_grande');
    const sessao = await query(
      'select id from sessoes where id = $1 and tenant_id = $2',
      [sessao_id, req.tenant.id],
    );
    if (!sessao.rows[0]) throw new ErroApi(404, 'sessao_nao_encontrada');

    const inseridos = await withTransaction((client) =>
      ingerirLogs(client, req.tenant.id, sessao_id, registros));
    return reply.code(201).send({ inseridos });
  });
}
