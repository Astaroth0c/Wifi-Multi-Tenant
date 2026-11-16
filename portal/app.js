'use strict';

const API = location.origin + '/v1';
const params = new URLSearchParams(location.search);
const state = {
  tenantId: params.get('tenant') || params.get('tenant_id') || localStorage.getItem('tenant_id'),
  mac: params.get('mac') || null,
  ip: params.get('ip') || null,
  config: null,
  token: sessionStorage.getItem('token') || null,
  telefoneCadastro: null,
  modoLogin: 'senha',
  timer: null,
};

const $ = (id) => document.getElementById(id);

function mostrarTela(id) {
  document.querySelectorAll('.tela').forEach((t) => t.classList.add('oculta'));
  $(id).classList.remove('oculta');
  window.scrollTo(0, 0);
}

function toast(mensagem, erro = false) {
  const el = $('toast');
  el.textContent = mensagem;
  el.classList.toggle('erro', erro);
  el.classList.remove('oculta');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('oculta'), 4000);
}

async function api(caminho, opcoes = {}) {
  const headers = { 'content-type': 'application/json', ...(opcoes.headers || {}) };
  if (state.tenantId) headers['x-tenant-id'] = state.tenantId;
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  const resp = await fetch(API + caminho, { ...opcoes, headers, body: opcoes.body ? JSON.stringify(opcoes.body) : undefined });
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const e = new Error(corpo.erro || 'erro_desconhecido');
    e.codigo = corpo.erro;
    e.status = resp.status;
    throw e;
  }
  return corpo;
}

function formatarTempo(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min ${String(s).padStart(2, '0')}s`;
}

function aplicarConfig() {
  const c = state.config;
  if (!c) return;
  $('titulo-estabelecimento').textContent = c.nome;
  document.title = `Wi-Fi — ${c.nome}`;
  $('subtitulo').textContent = c.ssid ? `Rede ${c.ssid}` : 'Acesso à internet para clientes';
  $('aviso-privacidade').textContent = c.aviso;
  $('rodape-tenant').textContent = `Limite diário: ${c.limite_diario_minutos} min · Termos v${c.termos_versao} · Privacidade v${c.politica_versao}`;
  $('ssid-atual').textContent = c.ssid || 'Wi-Fi do cliente';
  const iv = c.identidade_visual;
  if (iv && iv.cor_primaria) document.documentElement.style.setProperty('--cor-primaria', iv.cor_primaria);
}

async function conectarSessao() {
  const dados = await api('/sessoes', {
    method: 'POST',
    body: { mac: state.mac, ip_interno: state.ip },
  });
  iniciarPolling(dados.sessao.id);
  mostrarTela('tela-conectado');
  atualizarRestante(dados.tempo_restante_s);
}

function atualizarRestante(segundos) {
  $('tempo-restante').textContent = formatarTempo(segundos);
}

function iniciarPolling(sessaoId) {
  $('sessao-id').textContent = 'Sessão: ' + sessaoId.slice(0, 8);
  clearInterval(state.timer);
  state.timer = setInterval(verificarSessao, 30000);
}

async function verificarSessao() {
  try {
    const dados = await api('/sessoes/atual');
    atualizarRestante(dados.tempo_restante_s);
  } catch (e) {
    clearInterval(state.timer);
    if (e.codigo === 'limite_atingido') {
      $('bloqueio-titulo').textContent = '⛔ Limite atingido';
      $('bloqueio-mensagem').textContent = 'Você usou o tempo de hoje. Volte amanhã!';
      mostrarTela('tela-bloqueado');
    } else if (e.codigo === 'sessao_expirada') {
      $('bloqueio-titulo').textContent = '⏱️ Sessão expirada';
      $('bloqueio-mensagem').textContent = 'Sua sessão durou mais de 12 horas. Conecte-se novamente.';
      mostrarTela('tela-bloqueado');
    } else if (e.status === 401) {
      sessionStorage.removeItem('token');
      state.token = null;
      mostrarTela('tela-boas-vindas');
    }
  }
}

async function tentarReconectar() {
  if (!state.mac) return false;
  try {
    const dados = await api('/auth/reconectar', {
      method: 'POST',
      body: { mac: state.mac, ip_interno: state.ip },
    });
    state.token = dados.token;
    sessionStorage.setItem('token', dados.token);
    await conectarSessao();
    return true;
  } catch {
    return false;
  }
}

async function carregarConfig() {
  if (!state.tenantId) {
    $('titulo-estabelecimento').textContent = 'Portal não configurado';
    $('subtitulo').textContent = 'Abra o portal pelo popup do Wi-Fi (parâmetro tenant ausente).';
    return false;
  }
  localStorage.setItem('tenant_id', state.tenantId);
  try {
    state.config = await api(`/portal/config?tenant_id=${encodeURIComponent(state.tenantId)}`);
    aplicarConfig();
    return true;
  } catch {
    $('subtitulo').textContent = 'Não foi possível carregar as configurações da rede.';
    return false;
  }
}

function abrirCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Câmera indisponível — envie um arquivo.', true);
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640 } })
    .then((stream) => {
      const video = $('camera');
      video.srcObject = stream;
      video.classList.remove('oculta');
      $('btn-capturar').classList.remove('oculta');
      $('btn-abrir-camera').classList.add('oculta');
    })
    .catch(() => toast('Não foi possível acessar a câmera — envie um arquivo.', true));
}

function capturarFoto() {
  const video = $('camera');
  const canvas = $('foto-canvas');
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  canvas.toBlob(() => {
    streamParado();
    video.classList.add('oculta');
    $('btn-capturar').classList.add('oculta');
    const preview = $('foto-preview');
    preview.src = dataUrl;
    preview.classList.remove('oculta');
    preview.dataset.foto = dataUrl;
  }, 'image/jpeg', 0.8);
}

function streamParado() {
  const video = $('camera');
  if (video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}

function fotoSelecionada(file) {
  if (!/^image\/(png|jpeg)$/.test(file.type)) {
    toast('Use uma imagem PNG ou JPEG.', true);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = $('foto-canvas');
      const escala = Math.min(1, 640 / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const preview = $('foto-preview');
      preview.src = dataUrl;
      preview.classList.remove('oculta');
      preview.dataset.foto = dataUrl;
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

async function enviarCadastro(evento) {
  evento.preventDefault();
  const foto = $('foto-preview').dataset.foto;
  if (!foto) {
    toast('A foto é obrigatória.', true);
    return;
  }
  const botao = evento.submitter || $('form-cadastro button[type=submit]');
  botao.disabled = true;
  try {
    const corpo = await api('/auth/cadastro', {
      method: 'POST',
      body: {
        nome: $('cad-nome').value.trim(),
        email: $('cad-email').value.trim() || null,
        telefone: $('cad-telefone').value,
        senha: $('cad-senha').value,
        pin: $('cad-pin').value || null,
        foto,
        consentimento: {
          aceite: true,
          termos_versao: state.config.termos_versao,
          politica_versao: state.config.politica_versao,
        },
      },
    });
    state.telefoneCadastro = $('cad-telefone').value;
    streamParado();
    if (corpo.sms?.codigo) toast('Modo desenvolvimento: código ' + corpo.sms.codigo);
    mostrarTela('tela-sms');
  } catch (e) {
    const mensagens = {
      telefone_ja_cadastrado: 'Este telefone já tem conta — faça login.',
      foto_obrigatoria: 'A foto é obrigatória.',
      foto_formato_invalido: 'Foto inválida — use PNG ou JPEG.',
      consentimento_obrigatorio: 'É preciso aceitar os termos.',
    };
    toast(mensagens[e.codigo] || 'Erro no cadastro: ' + e.codigo, true);
  } finally {
    botao.disabled = false;
  }
}

async function verificarSms(evento) {
  evento.preventDefault();
  const botao = $('form-sms button[type=submit]');
  botao.disabled = true;
  try {
    const dados = await api('/auth/verificar', {
      method: 'POST',
      body: { telefone: state.telefoneCadastro, codigo: $('sms-codigo').value },
    });
    state.token = dados.token;
    sessionStorage.setItem('token', dados.token);
    await conectarSessao();
  } catch (e) {
    toast(e.codigo === 'codigo_incorreto' ? 'Código incorreto.' : 'Erro: ' + e.codigo, true);
  } finally {
    botao.disabled = false;
  }
}

async function reenviarCodigo() {
  try {
    const r = await api('/auth/reenviar-codigo', {
      method: 'POST',
      body: { telefone: state.telefoneCadastro },
    });
    if (r.codigo) toast('Modo desenvolvimento: código ' + r.codigo);
    else toast('Código reenviado por SMS.');
  } catch (e) {
    toast('Erro ao reenviar: ' + e.codigo, true);
  }
}

async function entrar(evento) {
  evento.preventDefault();
  const botao = $('form-login button[type=submit]');
  botao.disabled = true;
  try {
    const corpo = { identificador: $('login-identificador').value.trim() };
    if (state.modoLogin === 'senha') corpo.senha = $('login-senha').value;
    else corpo.pin = $('login-pin').value;
    const dados = await api('/auth/login', { method: 'POST', body: corpo });
    state.token = dados.token;
    sessionStorage.setItem('token', dados.token);
    await conectarSessao();
  } catch (e) {
    const mensagens = {
      credenciais_invalidas: 'Credenciais inválidas.',
      conta_suspensa: 'Conta suspensa — fale com o estabelecimento.',
      conta_nao_verificada: 'Conta não verificada — faça o cadastro.',
      conta_bloqueada_temporariamente: 'Muitas tentativas — aguarde alguns minutos.',
      limite_atingido: 'Limite diário atingido — volte amanhã.',
    };
    toast(mensagens[e.codigo] || 'Erro no login: ' + e.codigo, true);
    if (e.codigo === 'limite_atingido') mostrarTela('tela-bloqueado');
  } finally {
    botao.disabled = false;
  }
}

async function encerrar() {
  try { await api('/sessoes/encerrar', { method: 'POST', body: {} }); } catch { /* ignora */ }
  clearInterval(state.timer);
  sessionStorage.removeItem('token');
  state.token = null;
  mostrarTela('tela-boas-vindas');
}

function configurarEventos() {
  $('btn-cadastrar').addEventListener('click', () => mostrarTela('tela-cadastro'));
  $('btn-ir-login').addEventListener('click', () => mostrarTela('tela-login'));
  document.querySelectorAll('.voltar').forEach((b) =>
    b.addEventListener('click', () => mostrarTela(b.dataset.volta)));

  $('btn-abrir-camera').addEventListener('click', abrirCamera);
  $('btn-capturar').addEventListener('click', capturarFoto);
  $('foto-arquivo').addEventListener('change', (e) => {
    if (e.target.files[0]) fotoSelecionada(e.target.files[0]);
  });

  $('form-cadastro').addEventListener('submit', enviarCadastro);
  $('form-sms').addEventListener('submit', verificarSms);
  $('btn-reenviar').addEventListener('click', reenviarCodigo);
  $('form-login').addEventListener('submit', entrar);
  $('btn-logout').addEventListener('click', encerrar);

  $('aba-senha').addEventListener('click', () => {
    state.modoLogin = 'senha';
    $('aba-senha').classList.add('ativa');
    $('aba-pin').classList.remove('ativa');
    $('grupo-senha').classList.remove('oculta');
    $('grupo-pin').classList.add('oculta');
    $('login-pin').value = '';
  });
  $('aba-pin').addEventListener('click', () => {
    state.modoLogin = 'pin';
    $('aba-pin').classList.add('ativa');
    $('aba-senha').classList.remove('ativa');
    $('grupo-pin').classList.remove('oculta');
    $('grupo-senha').classList.add('oculta');
    $('login-senha').value = '';
  });

  window.addEventListener('pagehide', streamParado);
}

(async function iniciar() {
  configurarEventos();
  const ok = await carregarConfig();
  if (!ok) return;
  if (state.token) {
    try {
      const dados = await api('/sessoes/atual');
      iniciarPolling(dados.sessao.id);
      atualizarRestante(dados.tempo_restante_s);
      mostrarTela('tela-conectado');
      return;
    } catch { sessionStorage.removeItem('token'); state.token = null; }
  }
  const reconectou = await tentarReconectar();
  if (!reconectou) mostrarTela('tela-boas-vindas');
})();
