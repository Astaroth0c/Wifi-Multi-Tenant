import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hash as argonHash } from '@node-rs/argon2';
import { authenticator } from 'otplib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 55400 + (process.pid % 500);
const DIR = `/tmp/portal-cativo-test-${process.pid}`;

export const FOTO_TESTE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export async function iniciarBanco() {
  if (globalThis.__portalBanco) return globalThis.__portalBanco;
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const pg = new EmbeddedPostgres({
    databaseDir: DIR, user: 'teste', password: 'teste', port: PORT, persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('portal');
  process.env.DATABASE_URL = `postgres://teste:teste@127.0.0.1:${PORT}/portal`;
  process.env.JWT_SECRET = 'segredo-teste';
  const { pool } = await import('../src/db.js');
  const schema = await readFile(join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
  globalThis.__portalBanco = { pg, pool };
  return globalThis.__portalBanco;
}

export async function pararBanco() {
  const banco = globalThis.__portalBanco;
  if (!banco) return;
  globalThis.__portalBanco = undefined;
  await banco.pool.end().catch(() => {});
  await banco.pg.stop().catch(() => {});
}

export async function limparBanco() {
  const { pool } = globalThis.__portalBanco;
  await pool.query(`truncate
    auditoria_admin, sms_codigos, log_chain_state, logs_acesso,
    sessoes, dispositivos, usuarios, admin_users, tenants cascade`);
}

export async function buildApp() {
  const { buildApp: construir } = await import('../src/app.js');
  return construir();
}

export async function criarTenant(nome = 'Loja Teste', configuracoes = {}) {
  const { pool } = globalThis.__portalBanco;
  const r = await pool.query(
    'insert into tenants (nome, configuracoes) values ($1, $2) returning *',
    [nome, JSON.stringify(configuracoes)],
  );
  return r.rows[0];
}

export async function criarClienteAtivo(tenantId, opcoes = {}) {
  const {
    nome = 'Cliente Teste', telefone, senha = 'SenhaForte123', pin = null, status = 'ativo',
  } = opcoes;
  const tel = telefone ?? '+5511999990001';
  const { pool } = globalThis.__portalBanco;
  const { hmacHash, aesEncrypt } = await import('../src/services/crypto.js');
  const r = await pool.query(
    `insert into usuarios (tenant_id, nome, email, telefone_enc, telefone_hash, senha_hash, pin_hash, foto_enc, consentimento, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [tenantId, nome, `${tel.replace(/\D/g, '')}@exemplo.local`, aesEncrypt(tel), hmacHash(tel),
      await argonHash(senha), pin ? await argonHash(pin) : null, aesEncrypt(FOTO_TESTE),
      JSON.stringify({ aceite: true, termos_versao: '1.0', politica_versao: '1.0' }), status],
  );
  return r.rows[0];
}

export async function criarAdmin({ papel = 'rede', tenantId = null, email = 'admin@teste.local', senha = 'AdminSenha123' } = {}) {
  const { pool } = globalThis.__portalBanco;
  const totpSecret = authenticator.generateSecret();
  const r = await pool.query(
    `insert into admin_users (tenant_id, email, papel, senha_hash, totp_secret)
     values ($1,$2,$3,$4,$5) returning *`,
    [tenantId, email.toLowerCase(), papel, await argonHash(senha), totpSecret],
  );
  return { admin: r.rows[0], senha, totpSecret };
}

export function codigoTotp(secret) {
  return authenticator.generate(secret);
}

export async function criarSessaoDireto(tenantId, usuarioId, opcoes = {}) {
  const { pool } = globalThis.__portalBanco;
  const mac = opcoes.mac ?? 'AA:BB:CC:DD:EE:FF';
  const disp = await pool.query(
    `insert into dispositivos (tenant_id, usuario_id, mac) values ($1,$2,$3) returning id`,
    [tenantId, usuarioId, mac],
  );
  const inicio = opcoes.inicio ?? new Date();
  const r = await pool.query(
    `insert into sessoes (tenant_id, usuario_id, dispositivo_id, inicio, fim, tempo_total_s, ip_interno)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [tenantId, usuarioId, disp.rows[0].id, inicio, opcoes.fim ?? null,
      opcoes.tempo_total_s ?? 0, opcoes.ip_interno ?? '192.168.0.10'],
  );
  return { sessao: r.rows[0], dispositivo: disp.rows[0] };
}
