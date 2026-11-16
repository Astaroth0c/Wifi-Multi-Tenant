import crypto from 'node:crypto';
import { config } from '../config.js';

export function sha256(texto) {
  return crypto.createHash('sha256').update(texto).digest('hex');
}

export function hmacHash(valor) {
  return crypto.createHmac('sha256', config.dataKey)
    .update(String(valor).trim().toLowerCase())
    .digest('hex');
}

export function aesEncrypt(texto) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', config.dataKey, iv);
  const enc = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function aesDecrypt(b64) {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', config.dataKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function codigoSms6() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}
