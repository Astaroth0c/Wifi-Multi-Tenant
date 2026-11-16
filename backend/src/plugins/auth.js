import { query } from '../db.js';
import { ErroApi } from '../services/sessoes.js';

export async function authCliente(req, reply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ erro: 'token_invalido' });
  }
  const payload = req.user;
  if (payload.aud !== 'cliente') return reply.code(401).send({ erro: 'token_invalido' });
  const r = await query(
    'select id, tenant_id, status, token_version from usuarios where id = $1',
    [payload.sub],
  );
  const u = r.rows[0];
  if (!u || u.status !== 'ativo' || u.token_version !== payload.ver) {
    return reply.code(401).send({ erro: 'token_invalido' });
  }
  req.usuario = { id: u.id, tenant_id: u.tenant_id };
}

export function authAdmin(papelMinimo = 'loja') {
  return async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ erro: 'token_invalido' });
    }
    const payload = req.user;
    if (payload.aud !== 'admin') return reply.code(401).send({ erro: 'token_invalido' });
    const r = await query(
      'select id, tenant_id, papel, ativo, token_version from admin_users where id = $1',
      [payload.sub],
    );
    const a = r.rows[0];
    if (!a || !a.ativo || a.token_version !== payload.ver) {
      return reply.code(401).send({ erro: 'token_invalido' });
    }
    if (papelMinimo === 'rede' && a.papel !== 'rede') {
      return reply.code(403).send({ erro: 'permissao_negada' });
    }
    req.admin = { id: a.id, tenant_id: a.tenant_id, papel: a.papel };
  };
}

export function tenantDoAdmin(req) {
  if (req.admin.papel === 'rede') return { rede: true, tenantId: null };
  if (!req.admin.tenant_id) throw new ErroApi(403, 'permissao_negada');
  return { rede: false, tenantId: req.admin.tenant_id };
}

export function escopoTenant(req, tenantIdParam) {
  const { rede, tenantId } = tenantDoAdmin(req);
  if (rede) return tenantIdParam ?? null;
  if (tenantIdParam && tenantIdParam !== tenantId) throw new ErroApi(403, 'permissao_negada');
  return tenantId;
}

export async function resolveTenant(req, reply) {
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId) return reply.code(400).send({ erro: 'tenant_nao_informado' });
  const r = await query('select * from tenants where id = $1 and ativo = true', [tenantId]);
  if (!r.rows[0]) return reply.code(404).send({ erro: 'tenant_invalido' });
  req.tenant = r.rows[0];
}
