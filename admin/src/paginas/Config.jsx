import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Config({ sessao }) {
  const [cfg, setCfg] = useState(null);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(false);

  function query() {
    const p = new URLSearchParams();
    if (sessao.papel === 'rede') p.set('tenant_id', sessao.tenant_id_escopo || '');
    return p.toString();
  }

  useEffect(() => {
    api(`/config?${query()}`).then(setCfg).catch((e) => setErro(e.message));
  }, [sessao]);

  async function salvar(e) {
    e.preventDefault();
    setErro(null);
    setOk(false);
    try {
      const fd = new FormData(e.currentTarget);
      const limite = Number(fd.get('limite_diario_minutos'));
      const corpo = {
        configuracoes: {
          limite_diario_minutos: limite,
          bloqueio_adulto: fd.get('bloqueio_adulto') === 'on',
          ssid: fd.get('ssid'),
        },
        identidade_visual: {
          cor_primaria: fd.get('cor_primaria'),
          nome_exibicao: fd.get('nome_exibicao'),
        },
        gateway_sms: { provedor: fd.get('provedor_sms') },
      };
      const r = await api(`/config?${query()}`, { method: 'PUT', body: JSON.stringify(corpo) });
      setCfg((c) => ({ ...c, ...r }));
      setOk(true);
    } catch (err) {
      setErro(err.message);
    }
  }

  if (!cfg) return <div><h2>Configurações</h2>{erro && <p className="erro">{erro}</p>}<p>Carregando…</p></div>;

  const c = cfg.configuracoes || {};
  const iv = cfg.identidade_visual || {};
  const gs = cfg.gateway_sms || {};

  return (
    <div>
      <h2>Configurações do tenant {cfg.nome}</h2>
      <p>Router token: <code>{cfg.router_token ? `${String(cfg.router_token).slice(0, 6)}••••` : '(não definido)'}</code></p>
      <form className="cartao ficha" onSubmit={salvar}>
        <section>
          <h3>Controles de acesso</h3>
          <label>Limite diário (minutos)<input name="limite_diario_minutos" type="number" min={1} max={1440} defaultValue={c.limite_diario_minutos ?? 120} /></label>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input name="bloqueio_adulto" type="checkbox" defaultChecked={c.bloqueio_adulto !== false} /> Bloqueio de conteúdo adulto
          </label>
          <label>SSID<input name="ssid" defaultValue={c.ssid || ''} placeholder="Wi-Fi Clientes" /></label>
        </section>
        <section>
          <h3>Identidade visual do portal</h3>
          <label>Nome exibido<input name="nome_exibicao" defaultValue={iv.nome_exibicao || cfg.nome} /></label>
          <label>Cor primária<input name="cor_primaria" type="color" defaultValue={iv.cor_primaria || '#1d4ed8'} /></label>
        </section>
        <section>
          <h3>Gateway SMS</h3>
          <label>Provedor
            <select name="provedor_sms" defaultValue={gs.provedor || 'dev'}>
              <option value="dev">dev (código no log, apenas testes)</option>
              <option value="http">http (webhook configurado no .env)</option>
            </select>
          </label>
        </section>
        {erro && <p className="erro">{erro}</p>}
        {ok && <p className="ok">Configuração salva.</p>}
        <button>Salvar</button>
      </form>
    </div>
  );
}
