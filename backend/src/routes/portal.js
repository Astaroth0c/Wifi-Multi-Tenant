import { query } from '../db.js';
import { ErroApi } from '../services/sessoes.js';

export default async function portalRoutes(app) {
  app.get('/config', async (req) => {
    const tenantId = req.query.tenant_id;
    if (!tenantId) throw new ErroApi(400, 'tenant_nao_informado');
    const r = await query(
      `select nome, configuracoes, identidade_visual from tenants where id = $1 and ativo = true`,
      [tenantId],
    );
    const tenant = r.rows[0];
    if (!tenant) throw new ErroApi(404, 'tenant_invalido');
    const c = tenant.configuracoes || {};
    return {
      nome: tenant.nome,
      identidade_visual: tenant.identidade_visual || null,
      ssid: c.ssid ?? null,
      limite_diario_minutos: c.limite_diario_minutos ?? 120,
      termos_versao: c.termos_versao ?? '1.0',
      politica_versao: c.politica_versao ?? '1.0',
      aviso: 'Ao conectar, seus dados de acesso (dominios visitados, horarios e volume) ' +
        'sao registrados conforme a legislacao brasileira (Marco Civil e LGPD). ' +
        'Nao capturamos o conteudo das paginas visitadas.',
    };
  });
}
