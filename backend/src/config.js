const env = process.env;

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
