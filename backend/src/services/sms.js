import { config } from '../config.js';

export async function enviarSms(tenant, telefone, mensagem) {
  const gw = tenant.gateway_sms || { provedor: 'dev' };
  if (gw.provedor === 'http' && gw.url) {
    const resp = await fetch(gw.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(gw.token ? { authorization: `Bearer ${gw.token}` } : {}),
      },
      body: JSON.stringify({ telefone, mensagem, remetente: gw.remetente }),
    });
    if (!resp.ok) throw new Error(`gateway_sms_erro_${resp.status}`);
    return { provedor: 'http' };
  }
  if (config.env !== 'production') {
    const m = mensagem.match(/\b(\d{6})\b/);
    return { provedor: 'dev', codigo: m ? m[1] : null };
  }
  return { provedor: 'dev' };
}
