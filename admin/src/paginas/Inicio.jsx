import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Inicio({ sessao, irPara }) {
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    api('/resumo').then(setResumo).catch((e) => setErro(e.message));
  }, [sessao]);

  return (
    <div>
      <div className="boas-vindas vidro">
        <h2>Olá{sessao.email ? `, ${sessao.email}` : ''} 👋</h2>
        <p>Aqui está o resumo da sua rede agora mesmo.</p>
        <div className="acoes-rapidas">
          <button className="primario" onClick={() => irPara('clientes')}>Ver clientes</button>
          <button onClick={() => irPara('sessoes')}>Sessões ao vivo</button>
          <button onClick={() => irPara('logs')}>Consultar logs</button>
        </div>
      </div>

      {erro && <p className="erro">Não consegui carregar o resumo: {erro}</p>}
      {!resumo && !erro && <p className="muted" style={{ color: 'var(--cor-texto-suave)' }}>Carregando…</p>}

      {resumo && (
        <div className="painel-resumo">
          <div className="metrica vidro">
            <p className="rotulo">Clientes</p>
            <p className="valor">{resumo.clientes.total}</p>
            <p className="detalhe">{resumo.clientes.ativos} ativos · {resumo.clientes.suspensos} suspensos</p>
          </div>
          <div className="metrica vidro destaque">
            <p className="rotulo">Sessões ao vivo</p>
            <p className="valor">{resumo.sessoes_ativas}</p>
            <p className="detalhe">dispositivos conectados agora</p>
          </div>
          <div className="metrica vidro">
            <p className="rotulo">Logs hoje</p>
            <p className="valor">{resumo.hoje.logs}</p>
            <p className="detalhe">{resumo.hoje.bloqueios} bloqueios registrados</p>
          </div>
          {resumo.cadeia && (
            <div className="metrica vidro">
              <p className="rotulo">Cadeia de hash</p>
              <p className="valor">
                <span className={`badge ${resumo.cadeia.integra ? 'integra' : 'quebrada'}`}>
                  {resumo.cadeia.integra ? 'íntegra' : 'QUEBRADA'}
                </span>
              </p>
              <p className="detalhe">{resumo.cadeia.verificados} registros verificados</p>
            </div>
          )}
          {resumo.tenants != null && (
            <div className="metrica vidro">
              <p className="rotulo">Tenants ativos</p>
              <p className="valor">{resumo.tenants}</p>
              <p className="detalhe">lojas na sua rede</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
