import React, { useState } from 'react';
import { api, salvarToken } from './api.js';
import Clientes from './paginas/Clientes.jsx';
import Sessoes from './paginas/Sessoes.jsx';
import Logs from './paginas/Logs.jsx';
import Config from './paginas/Config.jsx';
import Tenants from './paginas/Tenants.jsx';
import Auditoria from './paginas/Auditoria.jsx';

const ABAS = [
  { id: 'clientes', rotulo: 'Clientes', comp: Clientes },
  { id: 'sessoes', rotulo: 'Sessões ao vivo', comp: Sessoes },
  { id: 'logs', rotulo: 'Logs', comp: Logs },
  { id: 'config', rotulo: 'Configurações', comp: Config },
  { id: 'tenants', rotulo: 'Tenants', comp: Tenants, papel: 'rede' },
  { id: 'auditoria', rotulo: 'Auditoria', comp: Auditoria },
];

export default function App() {
  const [sessao, setSessao] = useState(() => JSON.parse(localStorage.getItem('pc_admin_sessao') || 'null'));
  const [aba, setAba] = useState('clientes');
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const fd = new FormData(e.currentTarget);
      const r = await api('/login', {
        method: 'POST',
        body: JSON.stringify({
          email: fd.get('email'),
          senha: fd.get('senha'),
          codigo_totp: fd.get('codigo_totp'),
        }),
      });
      salvarToken(r.token);
      const s = { papel: r.papel, tenant_id: r.tenant_id };
      localStorage.setItem('pc_admin_sessao', JSON.stringify(s));
      setSessao(s);
    } catch (err) {
      setErro(mensagemErro(err.message));
    } finally {
      setCarregando(false);
    }
  }

  if (!sessao) {
    return (
      <div className="centralizado">
        <form className="cartao login" onSubmit={entrar}>
          <h1>Painel — Portal Cativo</h1>
          <label>E-mail<input name="email" type="email" required autoComplete="username" /></label>
          <label>Senha<input name="senha" type="password" required autoComplete="current-password" /></label>
          <label>Código 2FA (TOTP)<input name="codigo_totp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>
          {erro && <p className="erro">{erro}</p>}
          <button disabled={carregando}>{carregando ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </div>
    );
  }

  const abasPermitidas = ABAS.filter((a) => !a.papel || a.papel === sessao.papel);
  const Ativa = (abasPermitidas.find((a) => a.id === aba) || abasPermitidas[0]).comp;

  function deslogar() {
    localStorage.removeItem('pc_admin_sessao');
    localStorage.removeItem('pc_admin_token');
    setSessao(null);
  }

  return (
    <div className="layout">
      <aside>
        <h1 className="logo">Portal Cativo</h1>
        <p className="papel">{sessao.papel === 'rede' ? 'Admin da rede' : 'Admin da loja'}</p>
        <nav>
          {abasPermitidas.map((a) => (
            <button key={a.id} className={aba === a.id ? 'ativa' : ''} onClick={() => setAba(a.id)}>
              {a.rotulo}
            </button>
          ))}
        </nav>
        <button className="sair" onClick={deslogar}>Sair</button>
      </aside>
      <main>
        <Ativa sessao={sessao} />
      </main>
    </div>
  );
}

function mensagemErro(codigo) {
  const mapa = {
    credenciais_invalidas: 'E-mail ou senha incorretos.',
    totp_invalido: 'Código 2FA inválido.',
    campos_obrigatorios: 'Preencha todos os campos.',
    muitas_tentativas: 'Muitas tentativas. Aguarde um minuto.',
  };
  return mapa[codigo] || `Erro: ${codigo}`;
}
