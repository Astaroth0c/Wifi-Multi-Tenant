import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { aesEncrypt, hmacHash, codigoSms6 } from '../services/crypto.js';
import { enviarSms } from '../services/sms.js';
import { ErroApi, normalizarMac, upsertDispositivo, abrirSessao } from '../services/sessoes.js';
import { resolveTenant } from '../plugins/auth.js';

function tokenCliente(app, usuario) {
  return app.jwt.sign(
    { sub: usuario.id, tenant_id: usuario.tenant_id, aud: 'cliente', ver: usuario.token_version },
    { expiresIn: '12h' },
  );
}

function validarFoto(foto) {
  if (!foto) throw new ErroApi(400, 'foto_obrigatoria');
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(foto);
  if (!m) throw new ErroApi(400, 'foto_formato_invalido');
  const bytes = Buffer.from(m[2], 'base64').length;
  if (bytes === 0 || bytes > config.fotoMaxBytes) throw new ErroApi(400, 'foto_tamanho_invalido');
  return foto;
}

function validarConsentimento(consentimento, ip) {
  if (!consentimento || consentimento.aceite !== true) {
    throw new ErroApi(400, 'consentimento_obrigatorio');
  }
  if (!consentimento.termos_versao || !consentimento.politica_versao) {
    throw new ErroApi(400, 'versao_termos_obrigatoria');
  }
  return {
    aceite: true,
    termos_versao: String(consentimento.termos_versao),
    politica_versao: String(consentimento.politica_versao),
    ip,
    ts: new Date().toISOString(),
  };
}

function normalizarTelefone(telefone) {
  const digitos = String(telefone || '').replace(/\D/g, '');
  if (digitos.length < 10 || digitos.length > 13) throw new ErroApi(400, 'telefone_invalido');
  return `+${digitos}`;
}

async function criarCodigoSms(client, tenantId, telefoneHash) {
  const codigo = codigoSms6();
  await client.query(
    'update sms_codigos set usado = true where telefone_hash = $1 and usado = false',
    [telefoneHash],
  );
  await client.query(
    `insert into sms_codigos (tenant_id, telefone_hash, codigo_hash, expira_em)
     values ($1,$2,$3, now() + ($4 || ' minutes')::interval)`,
    [tenantId, telefoneHash, await argonHash(codigo), String(config.smsValidadeMinutos)],
  );
  return codigo;
}

export default async function authRoutes(app) {
  app.post('/cadastro', { preHandler: resolveTenant, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { nome, email, telefone, senha, pin, foto, consentimento } = req.body || {};
      if (!nome || !senha || !telefone) throw new ErroApi(400, 'campos_obrigatorios');
      if (String(senha).length < 8) throw new ErroApi(400, 'senha_fraca');
      if (pin && !/^\d{4,6}$/.test(String(pin))) throw new ErroApi(400, 'pin_invalido');
      validarFoto(foto);
      const consent = validarConsentimento(consentimento, req.ip);
      const tel = normalizarTelefone(telefone);
      const telHash = hmacHash(tel);

      const existente = await query('select id from usuarios where telefone_hash = $1', [telHash]);
      if (existente.rows[0]) throw new ErroApi(409, 'telefone_ja_cadastrado');

      const senhaHash = await argonHash(senha);
      const pinHash = pin ? await argonHash(pin) : null;
      const fotoEnc = aesEncrypt(foto);
      const telEnc = aesEncrypt(tel);
      const emailNorm = email ? String(email).trim().toLowerCase() : null;

      const usuario = await withTransaction(async (client) => {
        const r = await client.query(
          `insert into usuarios (tenant_id, nome, email, telefone_enc, telefone_hash, senha_hash, pin_hash, foto_enc, consentimento, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendente') returning *`,
          [req.tenant.id, nome, emailNorm, telEnc, telHash, senhaHash, pinHash, fotoEnc, consent],
        );
        return r.rows[0];
      });

      const codigo = await withTransaction((client) => criarCodigoSms(client, req.tenant.id, telHash));
      const sms = await enviarSms(req.tenant, tel, `Seu codigo de verificacao: ${codigo}`);
      return reply.code(201).send({ id: usuario.id, sms });
    });

  app.post('/verificar', { preHandler: resolveTenant, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { telefone, codigo } = req.body || {};
      if (!telefone || !codigo) throw new ErroApi(400, 'campos_obrigatorios');
      const telHash = hmacHash(normalizarTelefone(telefone));
      const r = await query(
        `select * from sms_codigos
          where telefone_hash = $1 and usado = false and expira_em > now()
          order by criado_em desc limit 1`,
        [telHash],
      );
      const registro = r.rows[0];
      if (!registro) throw new ErroApi(400, 'codigo_expirado');
      if (registro.tentativas >= config.smsMaxTentativas) throw new ErroApi(429, 'codigo_bloqueado');
      const ok = await argonVerify(registro.codigo_hash, String(codigo)).catch(() => false);
      if (!ok) {
        await query('update sms_codigos set tentativas = tentativas + 1 where id = $1', [registro.id]);
        throw new ErroApi(400, 'codigo_incorreto');
      }
      const usuario = await withTransaction(async (client) => {
        await client.query('update sms_codigos set usado = true where id = $1', [registro.id]);
        const u = await client.query(
          `update usuarios set status = 'ativo', ultimo_login = now(), tentativas_login = 0
            where telefone_hash = $1 and status = 'pendente' returning *`,
          [telHash],
        );
        if (!u.rows[0]) throw new ErroApi(400, 'usuario_nao_pendente');
        return u.rows[0];
      });
      return { token: tokenCliente(app, usuario), usuario: { id: usuario.id, nome: usuario.nome } };
    });

  app.post('/reenviar-codigo', { preHandler: resolveTenant, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req) => {
      const telHash = hmacHash(normalizarTelefone(req.body?.telefone));
      const tel = normalizarTelefone(req.body?.telefone);
      const u = await query('select id from usuarios where telefone_hash = $1 and status = $2', [telHash, 'pendente']);
      if (!u.rows[0]) throw new ErroApi(404, 'cadastro_nao_encontrado');
      const codigo = await withTransaction((client) => criarCodigoSms(client, req.tenant.id, telHash));
      return enviarSms(req.tenant, tel, `Seu codigo de verificacao: ${codigo}`);
    });

  app.post('/login', { preHandler: resolveTenant, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { identificador, senha, pin } = req.body || {};
      if (!identificador || (!senha && !pin)) throw new ErroApi(400, 'campos_obrigatorios');

      let usuario = null;
      if (String(identificador).includes('@')) {
        const r = await query('select * from usuarios where email = $1 and tenant_id = $2',
          [String(identificador).trim().toLowerCase(), req.tenant.id]);
        usuario = r.rows[0];
      } else {
        const r = await query('select * from usuarios where telefone_hash = $1 and tenant_id = $2',
          [hmacHash(normalizarTelefone(identificador)), req.tenant.id]);
        usuario = r.rows[0];
      }

      const registrarFalha = async (codigo) => {
        if (usuario) {
          const tentativas = usuario.tentativas_login + 1;
          const bloqueado = tentativas >= config.maxTentativasLogin;
          await query(
            `update usuarios set tentativas_login = $2,
               bloqueado_ate = case when $3 then now() + ($4 || ' minutes')::interval else bloqueado_ate end
             where id = $1`,
            [usuario.id, tentativas, bloqueado, String(config.bloqueioLoginMinutos)],
          );
        }
        return reply.code(401).send({ erro: codigo });
      };

      if (!usuario) return registrarFalha('credenciais_invalidas');
      if (usuario.status === 'suspenso') return reply.code(403).send({ erro: 'conta_suspensa' });
      if (usuario.status !== 'ativo') return reply.code(403).send({ erro: 'conta_nao_verificada' });
      if (usuario.bloqueado_ate && new Date(usuario.bloqueado_ate) > new Date()) {
        return reply.code(429).send({ erro: 'conta_bloqueada_temporariamente' });
      }

      const credOk = senha
        ? usuario.senha_hash && await argonVerify(usuario.senha_hash, String(senha)).catch(() => false)
        : usuario.pin_hash && await argonVerify(usuario.pin_hash, String(pin)).catch(() => false);
      if (!credOk) return registrarFalha('credenciais_invalidas');

      const u = await query(
        `update usuarios set tentativas_login = 0, bloqueado_ate = null, ultimo_login = now()
          where id = $1 returning *`,
        [usuario.id],
      );
      return { token: tokenCliente(app, u.rows[0]), usuario: { id: u.rows[0].id, nome: u.rows[0].nome } };
    });

  app.post('/reconectar', { preHandler: resolveTenant, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { mac, ip_interno, user_agent, fabricante, modelo } = req.body || {};
      const macNorm = await normalizarMac(mac);
      const r = await query(
        `select d.id as dispositivo_id, u.*
           from dispositivos d join usuarios u on u.id = d.usuario_id
          where d.mac = $1 and d.tenant_id = $2`,
        [macNorm, req.tenant.id],
      );
      const linha = r.rows[0];
      if (!linha || linha.status !== 'ativo') return reply.code(401).send({ erro: 'reconexao_nao_permitida' });

      const hoje = await query(
        `select 1 from sessoes where usuario_id = $1 and inicio::date = (now() at time zone 'utc')::date limit 1`,
        [linha.id],
      );
      if (!hoje.rows[0]) return reply.code(401).send({ erro: 'reconexao_nao_permitida' });

      const resultado = await withTransaction(async (client) => {
        const dispositivo = await upsertDispositivo(client, req.tenant.id, linha.id, macNorm, { user_agent, fabricante, modelo });
        const existente = await client.query(
          'select * from sessoes where usuario_id = $1 and fim is null order by inicio desc limit 1',
          [linha.id],
        );
        if (existente.rows[0]) return { sessao: existente.rows[0], novo: false };
        const sessao = await abrirSessao(client, req.tenant, linha, dispositivo, ip_interno);
        return { sessao, novo: true };
      });
      return {
        token: tokenCliente(app, linha),
        sessao: resultado.sessao,
        reconectado: true,
      };
    });
}
