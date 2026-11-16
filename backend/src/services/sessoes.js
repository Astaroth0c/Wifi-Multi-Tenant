import { query } from '../db.js';
import { config } from '../config.js';

export function limiteDiarioMinutos(tenant) {
  const c = tenant.configuracoes || {};
  return Number(c.limite_diario_minutos ?? config.limiteDiarioMinutosPadrao);
}

export class ErroApi extends Error {
  constructor(statusCode, codigo, extras = {}) {
    super(codigo);
    this.statusCode = statusCode;
    this.codigo = codigo;
    this.extras = extras;
  }
}

export async function normalizarMac(mac) {
  const m = String(mac || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (m.length !== 12) throw new ErroApi(400, 'mac_invalido');
  return m.match(/.{2}/g).join(':');
}

export async function upsertDispositivo(client, tenantId, usuarioId, mac, extra = {}) {
  const r = await client.query(
    `insert into dispositivos (tenant_id, usuario_id, mac, fabricante, modelo, user_agent)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (mac) do update set
       usuario_id = excluded.usuario_id,
       fabricante = coalesce(excluded.fabricante, dispositivos.fabricante),
       modelo = coalesce(excluded.modelo, dispositivos.modelo),
       user_agent = coalesce(excluded.user_agent, dispositivos.user_agent),
       ultimo_visto = now()
     returning id, usuario_id, mac`,
    [tenantId, usuarioId, mac, extra.fabricante || null, extra.modelo || null, extra.user_agent || null],
  );
  return r.rows[0];
}

export async function segundosUsadosHoje(client, usuarioId) {
  const exec = client ? (t, p) => client.query(t, p) : query;
  const r = await exec(
    `select coalesce(sum(tempo_total_s), 0)::bigint as total
       from sessoes
      where usuario_id = $1 and inicio::date = (now() at time zone 'utc')::date`,
    [usuarioId],
  );
  return Number(r.rows[0].total);
}

export async function abrirSessao(client, tenant, usuario, dispositivo, ipInterno) {
  const limite = limiteDiarioMinutos(tenant) * 60;
  const usados = await segundosUsadosHoje(client, usuario.id);
  if (usados >= limite) {
    throw new ErroApi(403, 'limite_atingido', { limite_diario_minutos: limite / 60 });
  }
  const r = await client.query(
    `insert into sessoes (tenant_id, usuario_id, dispositivo_id, ip_interno)
     values ($1,$2,$3,$4) returning *`,
    [tenant.id, usuario.id, dispositivo.id, ipInterno || null],
  );
  return r.rows[0];
}

export async function encerrarSessao(client, sessaoId, encerradaPor, dadosUp = 0, dadosDown = 0) {
  const exec = client ? (t, p) => client.query(t, p) : query;
  const r = await exec(
    `update sessoes set
       fim = now(),
       tempo_total_s = greatest(0, extract(epoch from (now() - inicio))::int),
       dados_up = $3,
       dados_down = $4,
       encerrada_por = $2
     where id = $1 and fim is null
     returning *`,
    [sessaoId, encerradaPor, dadosUp, dadosDown],
  );
  return r.rows[0] || null;
}

export async function sessaoAtiva(client, usuarioId) {
  const exec = client ? (t, p) => client.query(t, p) : query;
  const r = await exec(
    `select * from sessoes where usuario_id = $1 and fim is null order by inicio desc limit 1`,
    [usuarioId],
  );
  return r.rows[0] || null;
}

export async function verificarSessao(sessao, tenant) {
  const limite = limiteDiarioMinutos(tenant) * 60;
  const decorridos = Math.floor((Date.now() - new Date(sessao.inicio).getTime()) / 1000);
  if (decorridos >= config.sessionMaxHours * 3600) return 'expiracao';
  const fechados = await segundosUsadosHoje(null, sessao.usuario_id);
  const usados = fechados + decorridos;
  if (usados >= limite) return 'limite';
  return null;
}

export async function tempoRestanteSegundos(sessao, tenant) {
  const limite = limiteDiarioMinutos(tenant) * 60;
  const decorridos = Math.floor((Date.now() - new Date(sessao.inicio).getTime()) / 1000);
  const fechados = await segundosUsadosHoje(null, sessao.usuario_id);
  const porTempo = config.sessionMaxHours * 3600 - decorridos;
  const porLimite = limite - (fechados + decorridos);
  return Math.max(0, Math.min(porTempo, porLimite));
}
