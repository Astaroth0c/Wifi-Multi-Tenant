import React, { useEffect, useMemo, useState } from 'react';
import { api, salvarToken } from './api.js';
import Inicio from './paginas/Inicio.jsx';
import Clientes from './paginas/Clientes.jsx';
import Sessoes from './paginas/Sessoes.jsx';
import Logs from './paginas/Logs.jsx';
import Config from './paginas/Config.jsx';
import Tenants from './paginas/Tenants.jsx';
import Auditoria from './paginas/Auditoria.jsx';

const ABAS = [
  { id: 'inicio', rotulo: 'Início', icone: '🏠', comp: Inicio },
  { id: 'clientes', rotulo: 'Clientes', icone: '🧑‍🤝‍🧑', comp: Clientes },
  { id: 'sessoes', rotulo: 'Sessões ao vivo', icone: '📶', comp: Sessoes },
  { id: 'logs', rotulo: 'Logs', icone: '📜', comp: Logs },
  { id: 'config', rotulo: 'Configurações', icone: '⚙️', comp: Config },
  { id: 'tenants', rotulo: 'Tenants', icone: '🏢', comp: Tenants, papel: 'rede' },
  { id: 'auditoria', rotulo: 'Auditoria', icone: '🛡️', comp: Auditoria },
];

const TEMA_CHAVE = 'ow_tema';

function temaInicial() {
  const salvo = localStorage.getItem(TEMA_CHAVE);
  if (salvo === 'dark' || salvo === 'light') return salvo;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function PaletaComandos({ fechar, itens }) {
  const [busca, setBusca] = useState('');
  const [indice, setIndice] = useState(0);
  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return itens;
    return itens.filter((i) => i.rotulo.toLowerCase().includes(t));
  }, [busca, itens]);

  function executar(item) {
    fechar();
    item.acao();
  }

  function aoTeclar(e) {
    if (e.key === 'Escape') return fechar();
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndice((i) => Math.min(i + 1, filtrados.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndice((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtrados[indice]) executar(filtrados[indice]);
  }

  useEffect(() => { setIndice(0); }, [busca]);

  return (
    <div className="paleta-fundo" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className="paleta" onKeyDown={aoTeclar}>
        <input
          autoFocus
          placeholder="Ir para… (página, tema, sair)"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <ul>
          {filtrados.map((item, i) => (
            <li key={item.rotulo}>
              <button
                className={i === indice ? 'selecionada' : ''}
                onMouseEnter={() => setIndice(i)}
                onClick={() => executar(item)}
              >
                <span className="icone">{item.icone || '•'}</span> {item.rotulo}
              </button>
            </li>
          ))}
          {!filtrados.length && <li className="vazio">Nada encontrado para “{busca}”</li>}
        </ul>
      </div>
    </div>
  );
}

export default function App() {
  const [sessao, setSessao] = useState(() => JSON.parse(localStorage.getItem('pc_admin_sessao') || 'null'));
  const [aba, setAba] = useState('inicio');
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [tema, setTema] = useState(temaInicial);
  const [paletaAberta, setPaletaAberta] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = tema;
    localStorage.setItem(TEMA_CHAVE, tema);
  }, [tema]);

  useEffect(() => {
    function aoTeclar(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletaAberta((v) => !v);
      }
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  async function entrar(e) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const fd = new FormData(e.currentTarget);
      const email = fd.get('email');
      const r = await api('/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          senha: fd.get('senha'),
          codigo_totp: fd.get('codigo_totp'),
        }),
      });
      salvarToken(r.token);
      const s = { papel: r.papel, tenant_id: r.tenant_id, email };
      localStorage.setItem('pc_admin_sessao', JSON.stringify(s));
      setSessao(s);
    } catch (err) {
      setErro(mensagemErro(err.message));
    } finally {
      setCarregando(false);
    }
  }

  function deslogar() {
    localStorage.removeItem('pc_admin_sessao');
    localStorage.removeItem('pc_admin_token');
    setSessao(null);
  }

  if (!sessao) {
    return (
      <div className="centralizado">
        <form className="cartao login" onSubmit={entrar}>
          <div className="marca">
            <span className="marca-simbolo">O</span>
            <h1>OrangeWifi</h1>
          </div>
          <p className="slogan">Sua rede, sem nós.</p>
          <h2>Acessar o painel</h2>
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
  const abaAtiva = abasPermitidas.find((a) => a.id === aba) || abasPermitidas[0];
  const Ativa = abaAtiva.comp;

  const itensPaleta = [
    ...abasPermitidas.map((a) => ({ rotulo: a.rotulo, icone: a.icone, acao: () => setAba(a.id) })),
    { rotulo: `Tema ${tema === 'dark' ? 'claro' : 'escuro'}`, icone: tema === 'dark' ? '☀️' : '🌙', acao: () => setTema(tema === 'dark' ? 'light' : 'dark') },
    { rotulo: 'Sair da conta', icone: '🚪', acao: deslogar },
  ];

  return (
    <div className="layout">
      <aside className="vidro">
        <div className="logo"><span className="logo-simbolo">O</span> OrangeWifi</div>
        <p className="slogan-lateral">Sua rede, sem nós.</p>
        <p className="papel">{sessao.papel === 'rede' ? 'Admin da rede' : 'Admin da loja'}</p>
        <nav>
          {abasPermitidas.map((a) => (
            <button key={a.id} className={aba === a.id ? 'ativa' : ''} onClick={() => setAba(a.id)}>
              <span className="icone">{a.icone}</span> {a.rotulo}
            </button>
          ))}
        </nav>
        <button className="sair" onClick={deslogar}>🚪 Sair</button>
      </aside>
      <div className="conteudo">
        <header className="topbar vidro">
          <p className="titulo-topo">{abaAtiva.rotulo}</p>
          <div className="topbar-acoes">
            <button className="buscar" onClick={() => setPaletaAberta(true)}>
              Buscar… <kbd>Ctrl K</kbd>
            </button>
            <button
              className="icone-botao"
              title={`Tema ${tema === 'dark' ? 'claro' : 'escuro'}`}
              onClick={() => setTema(tema === 'dark' ? 'light' : 'dark')}
            >
              {tema === 'dark' ? '☀️' : '🌙'}
            </button>
            <span className="usuario">{sessao.email || 'admin'}</span>
          </div>
        </header>
        <main><Ativa sessao={sessao} irPara={setAba} /></main>
      </div>
      {paletaAberta && <PaletaComandos fechar={() => setPaletaAberta(false)} itens={itensPaleta} />}
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
