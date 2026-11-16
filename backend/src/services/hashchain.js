import { sha256 } from './crypto.js';

export function hashGenesis(tenantId) {
  return sha256(`GENESIS|${tenantId}`);
}

export function calcularHash(hashAnterior, registro) {
  const canon = [
    registro.tenant_id,
    registro.sessao_id ?? '',
    new Date(registro.ts).toISOString(),
    registro.tipo ?? '',
    registro.dominio ?? '',
    registro.url ?? '',
    registro.categoria ?? '',
    registro.acao ?? '',
    registro.ip_destino ?? '',
    registro.bytes ?? 0,
  ].join('|');
  return sha256(`${hashAnterior}|${canon}`);
}
