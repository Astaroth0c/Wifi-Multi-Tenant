import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Auditoria({ sessao }) {
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    const p = new URLSearchParams({ page: pagina });
    if (sessao.papel === 'rede') p.set('tenant_id', sessao.tenant_id_escopo || '');
    api(`/auditoria?${p.toString()}`).then(setDados).catch((e) => setErro(e.message));
  }, [pagina, sessao]);

  return (
    <div>
      <h2>Auditoria administrativa</h2>
      {erro && <p className="erro">{erro}</p>}
      {dados && (
        <>
          <table>
            <thead><tr><th>Quando</th><th>Admin</th><th>Ação</th><th>Alvo</th><th>Detalhes</th><th>IP</th></tr></thead>
            <tbody>
              {dados.registros.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.ts).toLocaleString('pt-BR')}</td>
                  <td>{String(r.admin_id).slice(0, 8)}…</td>
                  <td>{r.acao}</td>
                  <td>{r.alvo ? String(r.alvo).slice(0, 12) : '-'}</td>
                  <td>{r.detalhes ? JSON.stringify(r.detalhes).slice(0, 80) : '-'}</td>
                  <td>{r.ip}</td>
                </tr>
              ))}
              {dados.registros.length === 0 && <tr><td colSpan={6}>Nenhum registro.</td></tr>}
            </tbody>
          </table>
          <div className="paginacao">
            <button className="secundario" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
            <span>Página {dados.pagina}</span>
            <button className="secundario" disabled={dados.registros.length < 50} onClick={() => setPagina(pagina + 1)}>Próxima</button>
          </div>
        </>
      )}
    </div>
  );
}
