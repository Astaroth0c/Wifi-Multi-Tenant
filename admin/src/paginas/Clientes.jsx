import React, { useEffect, useState } from 'react';
import { api, exportarFicha } from '../api.js';

export default function Clientes({ sessao }) {
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [pagina, setPagina] = useState(1);
  const [ficha, setFicha] = useState(null);
  const [erro, setErro] = useState(null);

  const params = new URLSearchParams();
  if (sessao.papel === 'rede') params.set('tenant_id', sessao.tenant_id_escopo || '');
  if (busca) params.set('busca', busca);
  if (status) params.set('status', status);
  params.set('page', pagina);

  async function carregar() {
    try {
      setErro(null);
      const r = await api(`/clientes?${params.toString()}`);
      setLista(r);
    } catch (e) {
      setErro(e.message);
    }
  }

  useEffect(() => { carregar(); }, [busca, status, pagina, sessao.tenant_id_escopo]);

  async function abrirFicha(id) {
    setErro(null);
    try {
      const p = new URLSearchParams(params);
      const r = await api(`/clientes/${id}?${p.toString()}`);
      setFicha(r);
    } catch (e) {
      setErro(e.message);
    }
  }

  async function mudarStatus(id, novo) {
    try {
      const p = new URLSearchParams(params);
      await api(`/clientes/${id}?${p.toString()}`, { method: 'PATCH', body: JSON.stringify({ status: novo }) });
      await carregar();
      if (ficha?.usuario?.id === id) await abrirFicha(id);
    } catch (e) {
      setErro(e.message);
    }
  }

  async function excluir(id) {
    if (!window.confirm('Excluir (anonimizar) este cliente? Os logs são preservados anonimizados.')) return;
    try {
      const p = new URLSearchParams(params);
      await api(`/clientes/${id}?${p.toString()}`, { method: 'DELETE' });
      setFicha(null);
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <div>
      <h2>Clientes</h2>
      <div className="barra">
        <label>Buscar
          <input value={busca} onChange={(e) => { setPagina(1); setBusca(e.target.value); }} placeholder="nome ou e-mail" />
        </label>
        <label>Status
          <select value={status} onChange={(e) => { setPagina(1); setStatus(e.target.value); }}>
            <option value="">Todos</option>
            <option value="ativo">Ativo</option>
            <option value="pendente">Pendente</option>
            <option value="suspenso">Suspenso</option>
            <option value="removido">Removido</option>
          </select>
        </label>
      </div>
      {erro && <p className="erro">{erro}</p>}
      {lista && (
        <>
          <table>
            <thead>
              <tr><th>Nome</th><th>E-mail</th><th>Tenant</th><th>Status</th><th>Criado em</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {lista.clientes.map((c) => (
                <tr key={c.id}>
                  <td>{c.nome}</td>
                  <td>{c.email}</td>
                  <td>{String(c.tenant_id).slice(0, 8)}…</td>
                  <td><span className={`badge ${c.status}`}>{c.status}</span></td>
                  <td>{new Date(c.criado_em).toLocaleString('pt-BR')}</td>
                  <td>
                    <button className="secundario" onClick={() => abrirFicha(c.id)}>Ficha</button>{' '}
                    {c.status === 'ativo' && <button className="perigo" onClick={() => mudarStatus(c.id, 'suspenso')}>Suspender</button>}
                    {c.status === 'suspenso' && <button onClick={() => mudarStatus(c.id, 'ativo')}>Reativar</button>}{' '}
                    <button className="perigo" onClick={() => excluir(c.id)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="paginacao">
            <button className="secundario" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
            <span>Página {lista.pagina} — {lista.total} clientes</span>
            <button className="secundario" disabled={lista.pagina * 20 >= lista.total} onClick={() => setPagina(pagina + 1)}>Próxima</button>
          </div>
        </>
      )}
      {ficha && <Ficha ficha={ficha} fechar={() => setFicha(null)} />}
    </div>
  );
}

function Ficha({ ficha, fechar }) {
  const u = ficha.usuario;
  return (
    <div className="cartao ficha" style={{ marginTop: 20 }}>
      <h3>Ficha do cliente</h3>
      <section>
        <h3>Dados</h3>
        <p>Nome: {u.nome} · E-mail: {u.email} · Telefone: {u.telefone || '(oculto)'} · Status: {u.status}</p>
        <p>Consentimento: {JSON.stringify(u.consentimento)}</p>
        <p>Logs: {ficha.logs_resumo.total} no total, {ficha.logs_resumo.bloqueados} bloqueados, {Number(ficha.logs_resumo.bytes)} bytes</p>
        <button className="secundario" onClick={() => exportarFicha(u.id, 'csv')}>Exportar CSV</button>{' '}
        <button className="secundario" onClick={() => exportarFicha(u.id, 'pdf')}>Exportar PDF</button>{' '}
        <button onClick={fechar}>Fechar</button>
      </section>
      <section>
        <h3>Dispositivos</h3>
        <table>
          <thead><tr><th>MAC</th><th>Fabricante</th><th>Modelo</th><th>Último visto</th></tr></thead>
          <tbody>
            {ficha.dispositivos.map((d) => (
              <tr key={d.mac}><td>{d.mac}</td><td>{d.fabricante || '-'}</td><td>{d.modelo || '-'}</td><td>{new Date(d.ultimo_visto).toLocaleString('pt-BR')}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h3>Últimas sessões</h3>
        <table>
          <thead><tr><th>Início</th><th>Fim</th><th>Tempo</th><th>IP</th><th>Encerrada por</th></tr></thead>
          <tbody>
            {ficha.sessoes.map((s, i) => (
              <tr key={i}>
                <td>{new Date(s.inicio).toLocaleString('pt-BR')}</td>
                <td>{s.fim ? new Date(s.fim).toLocaleString('pt-BR') : 'ativa'}</td>
                <td>{Math.round((s.tempo_total_s || 0) / 60)} min</td>
                <td>{s.ip_interno}</td>
                <td>{s.encerrada_por || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
