import { query, withTransaction } from '../db.js';
import { authCliente } from '../plugins/auth.js';
import {
  ErroApi, normalizarMac, upsertDispositivo, abrirSessao,
  sessaoAtiva, encerrarSessao, verificarSessao, tempoRestanteSegundos,
} from '../services/sessoes.js';

async function tenantDoUsuario(usuarioId) {
  const r = await query(
    'select t.* from tenants t join usuarios u on u.tenant_id = t.id where u.id = $1',
    [usuarioId],
  );
  return r.rows[0];
}

export default async function sessaoRoutes(app) {
  app.post('/sessoes', { preHandler: authCliente }, async (req) => {
    const { mac, ip_interno, user_agent, fabricante, modelo } = req.body || {};
    const tenant = await tenantDoUsuario(req.usuario.id);
    if (!tenant || !tenant.ativo) throw new ErroApi(403, 'tenant_inativo');

    const existente = await sessaoAtiva(null, req.usuario.id);
    if (existente) {
      const motivo = await verificarSessao(existente, tenant);
      if (motivo) {
        await encerrarSessao(null, existente.id, motivo);
        throw new ErroApi(403, motivo === 'limite' ? 'limite_atingido' : 'sessao_expirada');
      }
      return { sessao: existente, tempo_restante_s: await tempoRestanteSegundos(existente, tenant), nova: false };
    }

    const macNorm = await normalizarMac(mac);
    return withTransaction(async (client) => {
      const dispositivo = await upsertDispositivo(client, tenant.id, req.usuario.id, macNorm, { user_agent, fabricante, modelo });
      const sessao = await abrirSessao(client, tenant, { id: req.usuario.id }, dispositivo, ip_interno);
      return { sessao, tempo_restante_s: await tempoRestanteSegundos(sessao, tenant), nova: true };
    });
  });

  app.get('/sessoes/atual', { preHandler: authCliente }, async (req, reply) => {
    const tenant = await tenantDoUsuario(req.usuario.id);
    const sessao = await sessaoAtiva(null, req.usuario.id);
    if (!sessao) return reply.code(404).send({ erro: 'sem_sessao_ativa' });
    const motivo = await verificarSessao(sessao, tenant);
    if (motivo) {
      await encerrarSessao(null, sessao.id, motivo);
      return reply.code(403).send({ erro: motivo === 'limite' ? 'limite_atingido' : 'sessao_expirada' });
    }
    return {
      sessao,
      tempo_restante_s: await tempoRestanteSegundos(sessao, tenant),
      limite_diario_minutos: (tenant.configuracoes || {}).limite_diario_minutos ?? 120,
    };
  });

  app.post('/sessoes/encerrar', { preHandler: authCliente }, async (req) => {
    const { dados_up = 0, dados_down = 0 } = req.body || {};
    const ativa = await sessaoAtiva(null, req.usuario.id);
    const encerrada = ativa ? await encerrarSessao(null, ativa.id, 'logout', dados_up, dados_down) : null;
    return { encerrada: Boolean(encerrada) };
  });
}
