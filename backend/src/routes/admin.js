import { authenticator } from 'otplib';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { aesDecrypt } from '../services/crypto.js';
import { authAdmin, escopoTenant } from '../plugins/auth.js';
import { registrarAuditoria } from '../services/auditoria.js';
import { verificarCadeia } from './roteador.js';
import { executarExpurgo } from '../services/expurgo.js';
import { encerrarSessao, ErroApi } from '../services/sessoes.js';
import { gerarCsv, gerarPdf } from '../services/ficha.js';

function tokenAdmin(app, admin) {
  return app.jwt.sign(
    { sub: admin.id, tenant_id: admin.tenant_id, papel: admin.papel, aud: 'admin', ver: admin.token_version },
    { expiresIn: '30m' },
  );
}

async function fichaCliente(usuarioId, tenantId) {
  const r = await query('select * from usuarios where id = $1 and tenant_id = $2', [usuarioId, tenantId]);
  const u = r.rows[0];
  if (!u) throw new ErroApi(404, 'cliente_nao_encontrado');
  const dispositivos = (await query(
    'select mac, fabricante, modelo, user_agent, primeiro_visto, ultimo_visto from dispositivos where usuario_id = $1 order by ultimo_visto desc',
    [usuarioId],
  )).rows;
  const sessoes = (await query(
    `select inicio, fim, tempo_total_s, dados_up, dados_down, ip_interno::text as ip_interno, encerrada_por
       from sessoes where usuario_id = $1 order by inicio desc limit 50`,
    [usuarioId],
  )).rows;
  const logsResumo = (await query(
    `select count(*)::bigint as total,
            count(*) filter (where acao = 'bloqueado')::bigint as bloqueados,
            coalesce(sum(bytes), 0)::bigint as bytes
       from logs_acesso l join sessoes s on s.id = l.sessao_id
      where s.usuario_id = $1`,
    [usuarioId],
  )).rows[0];
  let telefone = null;
  if (u.telefone_enc) {
    try { telefone = aesDecrypt(u.telefone_enc); } catch { telefone = null; }
  }
  return {
    usuario: {
      id: u.id, nome: u.nome, email: u.email, telefone, status: u.status,
      consentimento: u.consentimento, criado_em: u.criado_em, ultimo_login: u.ultimo_login,
    },
    dispositivos, sessoes, logs_resumo: logsResumo,
  };
}

export default async function adminRoutes(app) {
  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email, senha, codigo_totp } = req.body || {};
    if (!email || !senha || !codigo_totp) throw new ErroApi(400, 'campos_obrigatorios');
    const r = await query('select * from admin_users where email = $1 and ativo = true',
      [String(email).trim().toLowerCase()]);
    const admin = r.rows[0];
    const senhaOk = admin && await argonVerify(admin.senha_hash, String(senha)).catch(() => false);
    if (!senhaOk) return reply.code(401).send({ erro: 'credenciais_invalidas' });
    const totpOk = authenticator.check(String(codigo_totp), admin.totp_secret);
    if (!totpOk) return reply.code(401).send({ erro: 'totp_invalido' });

    await registrarAuditoria({ adminId: admin.id, tenantId: admin.tenant_id, acao: 'login_admin', ip: req.ip });
    return { token: tokenAdmin(app, admin), papel: admin.papel, tenant_id: admin.tenant_id };
  });

  app.get('/resumo', { preHandler: authAdmin() }, async (req) => {
    const tenantId = escopoTenant(req, req.query.tenant_id);
    const filtro = tenantId ? 'and tenant_id = $1' : '';
    const params = tenantId ? [tenantId] : [];
    const [clientes, sessoes, logsHoje, tenants] = await Promise.all([
      query(
        `select count(*)::int as total,
                count(*) filter (where status = 'ativo')::int as ativos,
                count(*) filter (where status = 'suspenso')::int as suspensos
           from usuarios where 1=1 ${filtro}`,
        params,
      ),
      query(
        `select count(*)::int as total from sessoes where fim is null ${filtro}`,
        params,
      ),
      query(
        `select count(*)::int as total,
                count(*) filter (where acao = 'bloqueado')::int as bloqueados
           from logs_acesso where ts >= date_trunc('day', now()) ${filtro}`,
        params,
      ),
      req.admin.papel === 'rede'
        ? query('select count(*)::int as total from tenants where ativo = true')
        : Promise.resolve(null),
    ]);
    const cadeia = tenantId ? await verificarCadeia(tenantId) : null;
    return {
      clientes: clientes.rows[0],
      sessoes_ativas: sessoes.rows[0].total,
      hoje: { logs: logsHoje.rows[0].total, bloqueios: logsHoje.rows[0].bloqueados },
      cadeia: cadeia ? { integra: cadeia.integra, verificados: cadeia.verificados } : null,
      tenants: tenants ? tenants.rows[0].total : null,
    };
  });

  app.post('/tokens/revogar', { preHandler: authAdmin() }, async (req) => {
    await query('update admin_users set token_version = token_version + 1 where id = $1', [req.admin.id]);
    await registrarAuditoria({ adminId: req.admin.id, tenantId: req.admin.tenant_id, acao: 'revogar_proprios_tokens', ip: req.ip });
    return { revogado: true };
  });

  app.get('/clientes', { preHandler: authAdmin() }, async (req) => {
    const tenantId = escopoTenant(req, req.query.tenant_id);
    const busca = req.query.busca ? `%${req.query.busca}%` : null;
    const status = req.query.status || null;
    const pagina = Math.max(1, Number(req.query.page || 1));
    const params = [];
    let where = 'where 1=1';
    if (tenantId) { params.push(tenantId); where += ` and tenant_id = $${params.length}`; }
    if (busca) { params.push(busca); where += ` and (nome ilike $${params.length} or email ilike $${params.length})`; }
    if (status) { params.push(status); where += ` and status = $${params.length}`; }
    const total = (await query(`select count(*)::int as t from usuarios ${where}`, params)).rows[0].t;
    params.push(20, (pagina - 1) * 20);
    const clientes = (await query(
      `select id, tenant_id, nome, email, status, criado_em, ultimo_login
         from usuarios ${where}
        order by criado_em desc limit $${params.length - 1} offset $${params.length}`,
      params,
    )).rows;
    return { total, pagina, clientes };
  });

  app.get('/clientes/:id', { preHandler: authAdmin() }, async (req) => {
    const tenantId = escopoTenant(req, req.query.tenant_id);
    const ficha = await fichaCliente(req.params.id, tenantId);
    await registrarAuditoria({
      adminId: req.admin.id, tenantId, acao: 'visualizar_ficha', alvo: req.params.id, ip: req.ip,
    });
    return ficha;
  });

  app.patch('/clientes/:id', { preHandler: authAdmin() }, async (req) => {
    const tenantId = escopoTenant(req, req.query.tenant_id);
    const { status, nome } = req.body || {};
    if (status && !['ativo', 'suspenso'].includes(status)) throw new ErroApi(400, 'status_invalido');
    const usuario = await withTransaction(async (client) => {
      const r = await client.query(
        `update usuarios set
           status = coalesce($3, status),
           nome = coalesce($4, nome),
           token_version = token_version + case when $3 = 'suspenso' then 1 else 0 end
         where id = $1 and tenant_id = $2 returning id, status`,
        [req.params.id, tenantId, status ?? null, nome ?? null],
      );
      if (!r.rows[0]) throw new ErroApi(404, 'cliente_nao_encontrado');
      if (status === 'suspenso') {
        const ativas = await client.query(
          'select id from sessoes where usuario_id = $1 and fim is null',
          [req.params.id],
        );
        for (const s of ativas.rows) await encerrarSessao(client, s.id, 'admin');
      }
      return r.rows[0];
    });
    await registrarAuditoria({
      adminId: req.admin.id, tenantId, acao: status === 'suspenso' ? 'suspender_cliente' : 'editar_cliente',
      alvo: req.params.id, detalhes: { status, nome }, ip: req.ip,
    });
    return usuario;
  });

  app.delete('/clientes/:id', { preHandler: authAdmin() }, async (req) => {
    const tenantId = escopoTenant(req, req.query.tenant_id);
    const usuario = await withTransaction(async (client) => {
      const r = await client.query(
        `update usuarios set
           nome = 'Titular removido', email = null, telefone_enc = null,
           telefone_hash = 'removido:' || id::text, senha_hash = null, pin_hash = null,
           foto_enc = null, status = 'removido', token_version = token_version + 1
         where id = $1 and tenant_id = $2 returning id`,
        [req.params.id, tenantId],
      );
      if (!r.rows[0]) throw new ErroApi(404, 'cliente_nao_encontrado');
      const ativas = await client.query('select id from sessoes where usuario_id = $1 and fim is null', [req.params.id]);
      for (const s of ativas.rows) await encerrarSessao(client, s.id, 'admin');
      return r.rows[0];
    });
    await registrarAuditoria({
      adminId: req.admin.id, tenantId, acao: 'excluir_cliente', alvo: req.params.id, ip: req.ip,
    });
    return { removido: true };
  });

  app.get('/clientes/:id/exportar', { preHandler: authAdmin() }, async (req, reply) => {
    const tenantId = escopoTenant(req, req.query.tenant_id);
    const ficha = await fichaCliente(req.params.id, tenantId);
    const formato = (req.query.formato || 'csv').toLowerCase();
    await registrarAuditoria({
      adminId: req.admin.id, tenantId, acao: 'exportar_ficha', alvo: req.params.id,
      detalhes: { formato }, ip: req.ip,
    });
    const secoes = [
      { titulo: 'Cliente', registros: ficha.usuario },
      { titulo: 'Dispositivos', colunas: ['mac', 'fabricante', 'modelo', 'primeiro_visto', 'ultimo_visto'], registros: ficha.dispositivos },
      { titulo: 'Sessoes', colunas: ['inicio', 'fim', 'tempo_total_s', 'ip_interno', 'encerrada_por'], registros: ficha.sessoes },
      { titulo: 'Resumo de logs', registros: ficha.logs_resumo },
    ];
    if (formato === 'pdf') {
      const pdf = gerarPdf('Ficha do cliente', secoes);
      return reply.header('content-type', 'application/pdf')
        .header('content-disposition', `attachment; filename="ficha-${req.params.id}.pdf"`)
        .send(pdf);
    }
    return reply.header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="ficha-${req.params.id}.csv"`)
      .send(gerarCsv(secoes));
  });

  app.get('/sessoes/ao-vivo', { preHandler: authAdmin() }, async (req) => {
    const tenantId = escopoTenant(req, req.query.tenant_id);
    const params = [];
    let where = 'where s.fim is null';
    if (tenantId) { params.push(tenantId); where += ` and s.tenant_id = $${params.length}`; }
    const sessoes = (await query(
      `select s.id, s.tenant_id, s.usuario_id, s.inicio, s.ip_interno::text as ip_interno,
              u.nome as cliente, d.mac
         from sessoes s
         join usuarios u on u.id = s.usuario_id
         join dispositivos d on d.id = s.dispositivo_id
         ${where} order by s.inicio desc limit 200`,
      params,
    )).rows;
    return { sessoes };
  });

  app.get('/logs', { preHandler: authAdmin() }, async (req) => {
    const tenantId = escopoTenant(req, req.query.tenant_id);
    const params = [];
    let where = 'where 1=1';
    if (tenantId) { params.push(tenantId); where += ` and l.tenant_id = $${params.length}`; }
    if (req.query.sessao_id) { params.push(req.query.sessao_id); where += ` and l.sessao_id = $${params.length}`; }
    if (req.query.dominio) { params.push(`%${req.query.dominio}%`); where += ` and l.dominio ilike $${params.length}`; }
    if (req.query.acao) { params.push(req.query.acao); where += ` and l.acao = $${params.length}`; }
    if (req.query.categoria) { params.push(req.query.categoria); where += ` and l.categoria = $${params.length}`; }
    if (req.query.de) { params.push(req.query.de); where += ` and l.ts >= $${params.length}`; }
    if (req.query.ate) { params.push(req.query.ate); where += ` and l.ts <= $${params.length}`; }
    const pagina = Math.max(1, Number(req.query.page || 1));
    const total = (await query(`select count(*)::int as t from logs_acesso l ${where}`, params)).rows[0].t;
    params.push(50, (pagina - 1) * 50);
    const logs = (await query(
      `select l.id, l.tenant_id, l.sessao_id, l.ts, l.tipo, l.dominio, l.url, l.categoria,
              l.acao, l.ip_destino::text as ip_destino, l.bytes
         from logs_acesso l ${where}
        order by l.id desc limit $${params.length - 1} offset $${params.length}`,
      params,
    )).rows;
    return { total, pagina, logs };
  });

  app.get('/logs/cadeia', { preHandler: authAdmin() }, async (req) => {
    const tenantId = escopoTenant(req, req.query.tenant_id);
    if (!tenantId) throw new ErroApi(400, 'tenant_id_obrigatorio');
    return verificarCadeia(tenantId);
  });

  app.get('/config', { preHandler: authAdmin() }, async (req) => {
    const tenantId = escopoTenant(req, req.query.tenant_id);
    if (!tenantId) throw new ErroApi(400, 'tenant_id_obrigatorio');
    const r = await query(
      'select id, nome, configuracoes, identidade_visual, gateway_sms, router_token from tenants where id = $1',
      [tenantId],
    );
    return r.rows[0];
  });

  app.put('/config', { preHandler: authAdmin() }, async (req) => {
    const tenantId = escopoTenant(req, req.query.tenant_id);
    if (!tenantId) throw new ErroApi(400, 'tenant_id_obrigatorio');
    const { configuracoes, identidade_visual, gateway_sms } = req.body || {};
    if (configuracoes?.limite_diario_minutos !== undefined) {
      const v = Number(configuracoes.limite_diario_minutos);
      if (!Number.isFinite(v) || v < 1 || v > 1440) throw new ErroApi(400, 'limite_diario_invalido');
    }
    const r = await query(
      `update tenants set
         configuracoes = coalesce($2, configuracoes),
         identidade_visual = coalesce($3, identidade_visual),
         gateway_sms = coalesce($4, gateway_sms)
       where id = $1 returning id, configuracoes, identidade_visual, gateway_sms`,
      [tenantId,
        configuracoes ? JSON.stringify(configuracoes) : null,
        identidade_visual ? JSON.stringify(identidade_visual) : null,
        gateway_sms ? JSON.stringify(gateway_sms) : null],
    );
    await registrarAuditoria({
      adminId: req.admin.id, tenantId, acao: 'editar_config_tenant', alvo: tenantId, ip: req.ip,
    });
    return r.rows[0];
  });

  app.post('/tenants', { preHandler: authAdmin('rede') }, async (req, reply) => {
    const { nome, cnpj, configuracoes, identidade_visual, gateway_sms } = req.body || {};
    if (!nome) throw new ErroApi(400, 'nome_obrigatorio');
    const r = await query(
      `insert into tenants (nome, cnpj, configuracoes, identidade_visual, gateway_sms)
       values ($1,$2,$3,$4,$5) returning *`,
      [nome, cnpj ?? null,
        configuracoes ? JSON.stringify(configuracoes) : '{}',
        identidade_visual ? JSON.stringify(identidade_visual) : null,
        gateway_sms ? JSON.stringify(gateway_sms) : '{"provedor":"dev"}'],
    );
    await registrarAuditoria({
      adminId: req.admin.id, acao: 'criar_tenant', alvo: r.rows[0].id, detalhes: { nome }, ip: req.ip,
    });
    return reply.code(201).send(r.rows[0]);
  });

  app.get('/auditoria', { preHandler: authAdmin() }, async (req) => {
    const tenantId = escopoTenant(req, req.query.tenant_id);
    const params = [];
    let where = 'where 1=1';
    if (tenantId) { params.push(tenantId); where += ` and tenant_id = $${params.length}`; }
    const pagina = Math.max(1, Number(req.query.page || 1));
    params.push(50, (pagina - 1) * 50);
    const registros = (await query(
      `select id, admin_id, tenant_id, acao, alvo, detalhes, ts, ip::text as ip
         from auditoria_admin ${where}
        order by ts desc limit $${params.length - 1} offset $${params.length}`,
      params,
    )).rows;
    return { pagina, registros };
  });

  app.post('/expurgo', { preHandler: authAdmin('rede') }, async (req) => {
    const dias = Number(req.body?.dias || config.retentionDays);
    const removidas = await executarExpurgo(dias, req.admin.id);
    return { particoes_removidas: removidas };
  });
}
