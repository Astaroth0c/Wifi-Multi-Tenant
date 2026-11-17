import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const env = process.env;

// carrega o .env do backend sem sobrescrever variáveis já definidas no ambiente
try {
  const caminhoEnv = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (existsSync(caminhoEnv)) {
    for (const linha of readFileSync(caminhoEnv, 'utf8').split('\n')) {
      const m = linha.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].trim();
    }
  }
} catch { /* sem .env: usa defaults */ }

function dataKey() {
  if (env.DATA_KEY) {
    const buf = Buffer.from(env.DATA_KEY, 'base64');
    if (buf.length === 32) return buf;
  }
  return Buffer.alloc(32, 7);
}

export const config = {
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',
  databaseUrl: env.DATABASE_URL || 'postgres://portal:portal@localhost:5432/portal',
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me',
  dataKey: dataKey(),
  retentionDays: Number(env.RETENCAO_DIAS || 365),
  sessionMaxHours: 12,
  limiteDiarioMinutosPadrao: 120,
  maxTentativasLogin: 5,
  bloqueioLoginMinutos: 15,
  smsValidadeMinutos: 10,
  smsMaxTentativas: 5,
  fotoMaxBytes: 2 * 1024 * 1024,
};
