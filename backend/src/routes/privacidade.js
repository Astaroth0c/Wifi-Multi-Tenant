import { query, withTransaction } from '../db.js';
import { authCliente } from '../plugins/auth.js';
import { aesDecrypt } from '../services/crypto.js';
import { registrarAuditoria } from '../services/auditoria.js';
import { sessaoAtiva, encerrarSessao } from '../services/sessoes.js';

function decampo(valor) {
  if (!valor) return null;
  try { return aesDecrypt(valor); } catch { return null; }
}

export default async function privacidadeRoutes(app) {
  app.get('/meus-dados', { preHandler: authCliente }, async (req) => {
    const u = await query('select * from usuarios where id = $1', [req.usuario.id]);
    const usuario = u.rows[0];
    const dispositivos = await query(
      'select mac, fabricante, modelo, user_agent, primeiro_visto, ultimo_visto from dispositivos where usuario_id = $1',
      [req.usuario.id],
    );
    const sessoes = await query(
      `select inicio, fim, tempo_total_s, ip_interno::text as ip_interno, encerrada_por
         from sessoes where usuario_id = $1 order by inicio desc limit 100`,
      [req.usuario.id],
    );
    const logs = await query(
      `select count(*)::int as total,
              count(*) filter (where acao = 'bloqueado')::int as bloqueados
         from logs_acesso l join sessoes s on s.id = l.sessao_id
        where s.usuario_id = $1`,
      [req.usuario.id],
    );
    return {
      usuario: {
        nome: usuario.nome,
        email: usuario.email,
        telefone: decampo(usuario.telefone_enc),
        consentimento: usuario.consentimento,
        criado_em: usuario.criado_em,
        ultimo_login: usuario.ultimo_login,
        status: usuario.status,
      },
      dispositivos: dispositivos.rows,
      sessoes: sessoes.rows,
      logs: logs.rows[0],
    };
  });

  app.delete('/meus-dados', { preHandler: authCliente }, async (req) => {
    await withTransaction(async (client) => {
      const r = await client.query(
        `update usuarios set
           nome = 'Titular removido',
           email = null,
           telefone_enc = null,
           telefone_hash = 'removido:' || id::text,
           senha_hash = null,
           pin_hash = null,
           foto_enc = null,
           consentimento = consentimento || jsonb_build_object('exclusao_titular', now()),
           status = 'removido',
           token_version = token_version + 1
         where id = $1 returning id, tenant_id`,
        [req.usuario.id],
      );
      const usuario = r.rows[0];
      const ativa = await sessaoAtiva(client, req.usuario.id);
      if (ativa) await encerrarSessao(client, ativa.id, 'logout');
      await registrarAuditoria({
        tenantId: usuario.tenant_id,
        acao: 'lgpd_exclusao_titular',
        alvo: usuario.id,
        ip: req.ip,
        client,
      });
    });
    return { removido: true };
  });
}
