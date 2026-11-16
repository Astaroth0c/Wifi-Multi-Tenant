import React, { useState } from 'react';
import { api } from '../api.js';

export default function Tenants() {
  const [ok, setOk] = useState(null);
  const [criado, setCriado] = useState(null);
  const [erro, setErro] = useState(null);

  async function criar(e) {
    e.preventDefault();
    setErro(null);
    setOk(null);
    setCriado(null);
    try {
      const fd = new FormData(e.currentTarget);
      const r = await api('/tenants', {
        method: 'POST',
        body: JSON.stringify({
          nome: fd.get('nome'),
          cnpj: fd.get('cnpj') || null,
          configuracoes: { limite_diario_minutos: Number(fd.get('limite') || 120), bloqueio_adulto: true },
          gateway_sms: { provedor: 'dev' },
        }),
      });
      setCriado(r);
      setOk('Tenant criado. Copie o ID para provisionar o roteador da loja.');
      e.currentTarget.reset();
    } catch (err) {
      setErro(err.message);
    }
  }

  return (
    <div>
      <h2>Novo tenant (loja)</h2>
      <form className="cartao ficha" onSubmit={criar}>
        <section>
          <h3>Dados da loja</h3>
          <label>Nome<input name="nome" required /></label>
          <label>CNPJ (opcional)<input name="cnpj" /></label>
          <label>Limite diário padrão (minutos)<input name="limite" type="number" min={1} max={1440} defaultValue={120} /></label>
        </section>
        {erro && <p className="erro">{erro}</p>}
        {ok && <p className="ok">{ok}</p>}
        {criado && (
          <p>
            Tenant ID: <code>{criado.id}</code><br />
            Router token: <code>{criado.router_token || '(defina no banco ou via seed)'}</code>
          </p>
        )}
        <button>Criar tenant</button>
      </form>
    </div>
  );
}
