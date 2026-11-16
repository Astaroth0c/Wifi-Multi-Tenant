import { query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { registrarAuditoria } from '../services/auditoria.js';

function nomeParticao(data) {
  const y = data.getUTCFullYear();
  const m = String(data.getUTCMonth() + 1).padStart(2, '0');
  return `logs_acesso_${y}${m}`;
}

export async function garantirParticao(client, data) {
  const d = new Date(data);
  const r = await client.query('select criar_particao_logs($1::date) as nome', [
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`,
  ]);
  return r.rows[0].nome;
}

export async function particoesExistentes() {
  const r = await query(
    `select tablename from pg_tables
      where schemaname = 'public' and tablename like 'logs_acesso_%'
      order by tablename`,
  );
  return r.rows.map((row) => row.tablename);
}

export async function executarExpurgo(retentionDays = config.retentionDays, adminId = null) {
  const cortante = new Date(Date.now() - retentionDays * 24 * 3600 * 1000);
  const mesCorte = `${cortante.getUTCFullYear()}-${String(cortante.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const removidas = [];
  for (const nome of await particoesExistentes()) {
    const sufixo = nome.replace('logs_acesso_', '');
    const inicioParticao = `${sufixo.slice(0, 4)}-${sufixo.slice(4, 6)}-01`;
    if (inicioParticao < mesCorte) {
      await query(`drop table if exists ${nome}`);
      removidas.push(nome);
    }
  }
  await registrarAuditoria({
    adminId,
    acao: 'expurgo_logs',
    alvo: `retencao_${retentionDays}d`,
    detalhes: { particoes_removidas: removidas, mes_corte: mesCorte },
  });
  return removidas;
}
