import { query } from '../db.js';

export async function registrarAuditoria({ adminId = null, tenantId = null, acao, alvo = null, detalhes = null, ip = null, client = null }) {
  const exec = client ? (t, p) => client.query(t, p) : query;
  await exec(
    `insert into auditoria_admin (admin_id, tenant_id, acao, alvo, detalhes, ip)
     values ($1,$2,$3,$4,$5,$6)`,
    [adminId, tenantId, acao, alvo, detalhes ? JSON.stringify(detalhes) : null, ip],
  );
}
