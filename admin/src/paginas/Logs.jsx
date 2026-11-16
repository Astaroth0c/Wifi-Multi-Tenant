import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Logs({ sessao }) {
  const [filtros, setFiltros] = useState({ sessao_id: '', dominio: '', acao: '', categoria: '', de: '', ate: '' });
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState(null);
  const [cadeia, setCadeia] = useState(null);
  const [erro, setErro] = useState(null);

  function query(extra = {}) {
    const p = new URLSearchParams();
    if (sessao.papel === 'rede') p.set('tenant_id', sessao.tenant_id_escopo || '');
    for (const [k, v] of Object.entries({ ...filtros, ...extra })) if (v) p.set(k, v);
    return p.toString();
  }

  useEffect(() => {
    api(`/logs?${query()}&page=${pagina}`).then(setDados).catch((e) => setErro(e.message));
  }, [filtros, pagina, sessao]);

  useEffect(() => {
    if (sessao.papel === 'rede' && !sessao.tenant_id_escopo) return;
    api(`/logs/cadeia?${query()}`).then(setCadeia).catch(() => setCadeia(null));
  }, [sessao]);

  function mudar(campo, valor) {
    setPagina(1);
    setFiltros((f) => ({ ...f, [campo]: valor }));
  }

  return (
    <div>
      <h2>Logs de acesso</h2>
      {cadeia && (
        <p>
          Cadeia de hash:{' '}
          <span className={`badge ${cadeia.integra ? 'integra' : 'quebrada'}`}>
            {cadeia.integra ? 'íntegra' : 'QUEBRADA — possível adulteração'}
          </span>
          {' '}{cadeia.total_registros != null && `(${cadeia.total_registros} registros)`}
        </p>
      )}
      <div className="barra">
        <label>Sessão ID<input value={filtros.sessao_id} onChange={(e) => mudar('sessao_id', e.target.value)} /></label>
        <label>Domínio<input value={filtros.dominio} onChange={(e) => mudar('dominio', e.target.value)} /></label>
        <label>Ação
          <select value={filtros.acao} onChange={(e) => mudar('acao', e.target.value)}>
            <option value="">Todas</option>
            <option value="permitido">Permitido</option>
            <option value="bloqueado">Bloqueado</option>
          </select>
        </label>
        <label>Categoria<input value={filtros.categoria} onChange={(e) => mudar('categoria', e.target.value)} placeholder="ex.: adulto" /></label>
        <label>De<input type="date" value={filtros.de} onChange={(e) => mudar('de', e.target.value)} /></label>
        <label>Até<input type="date" value={filtros.ate} onChange={(e) => mudar('ate', e.target.value)} /></label>
      </div>
      {erro && <p className="erro">{erro}</p>}
      {dados && (
        <>
          <table>
            <thead>
              <tr><th>Quando</th><th>Tipo</th><th>Domínio</th><th>Categoria</th><th>Ação</th><th>IP destino</th><th>Bytes</th></tr>
            </thead>
            <tbody>
              {dados.logs.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.ts).toLocaleString('pt-BR')}</td>
                  <td>{l.tipo}</td>
                  <td>{l.dominio || '-'}</td>
                  <td>{l.categoria || '-'}</td>
                  <td><span className={`badge ${l.acao}`}>{l.acao}</span></td>
                  <td>{l.ip_destino || '-'}</td>
                  <td>{l.bytes ?? '-'}</td>
                </tr>
              ))}
              {dados.logs.length === 0 && <tr><td colSpan={7}>Nenhum log encontrado.</td></tr>}
            </tbody>
          </table>
          <div className="paginacao">
            <button className="secundario" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
            <span>Página {dados.pagina} — {dados.total} registros</span>
            <button className="secundario" disabled={dados.pagina * 50 >= dados.total} onClick={() => setPagina(pagina + 1)}>Próxima</button>
          </div>
        </>
      )}
    </div>
  );
}
