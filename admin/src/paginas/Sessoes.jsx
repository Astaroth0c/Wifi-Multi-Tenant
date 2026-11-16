import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Sessoes({ sessao }) {
  const [sessoes, setSessoes] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    async function carregar() {
      try {
        const p = sessao.papel === 'rede' && sessao.tenant_id_escopo
          ? `?tenant_id=${sessao.tenant_id_escopo}` : '';
        const r = await api(`/sessoes/ao-vivo${p}`);
        if (vivo) { setSessoes(r.sessoes); setErro(null); }
      } catch (e) {
        if (vivo) setErro(e.message);
      }
    }
    carregar();
    const t = setInterval(carregar, 15000);
    return () => { vivo = false; clearInterval(t); };
  }, [sessao]);

  return (
    <div>
      <h2>Sessões ao vivo</h2>
      <p>Atualiza automaticamente a cada 15 segundos.</p>
      {erro && <p className="erro">{erro}</p>}
      {sessoes && (
        <table>
          <thead><tr><th>Cliente</th><th>MAC</th><th>IP interno</th><th>Tenant</th><th>Início</th></tr></thead>
          <tbody>
            {sessoes.map((s) => (
              <tr key={s.id}>
                <td>{s.cliente}</td>
                <td>{s.mac}</td>
                <td>{s.ip_interno}</td>
                <td>{String(s.tenant_id).slice(0, 8)}…</td>
                <td>{new Date(s.inicio).toLocaleString('pt-BR')}</td>
              </tr>
            ))}
            {sessoes.length === 0 && <tr><td colSpan={5}>Nenhuma sessão ativa.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
