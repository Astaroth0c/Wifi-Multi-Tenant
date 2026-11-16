import { authenticator } from 'otplib';
import { hash as argonHash } from '@node-rs/argon2';
import { query } from '../db.js';

const email = process.env.ADMIN_EMAIL || 'admin@rede.local';
const senha = process.env.ADMIN_SENHA || 'troque-esta-senha';

async function main() {
  const totpSecret = authenticator.generateSecret();
  const senhaHash = await argonHash(senha);
  const r = await query(
    `insert into admin_users (email, papel, senha_hash, totp_secret)
     values ($1, 'rede', $2, $3)
     on conflict (email) do update set senha_hash = excluded.senha_hash, totp_secret = excluded.totp_secret
     returning id`,
    [email.toLowerCase(), senhaHash, totpSecret],
  );
  console.log('Admin da rede criado/atualizado:', r.rows[0].id);
  console.log('Email:', email);
  console.log('Segredo TOTP (cadastre no app autenticador):', totpSecret);
  process.exit(0);
}

main().catch((err) => {
  console.error('Falha no seed:', err.message);
  process.exit(1);
});
