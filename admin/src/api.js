const TOKEN_CHAVE = 'pc_admin_token';

export function tokenAtual() {
  return localStorage.getItem(TOKEN_CHAVE);
}

export function salvarToken(token) {
  if (token) localStorage.setItem(TOKEN_CHAVE, token);
  else localStorage.removeItem(TOKEN_CHAVE);
}

export function sair() {
  salvarToken(null);
  window.location.reload();
}

export async function api(caminho, opcoes = {}) {
  const headers = { 'content-type': 'application/json', ...(opcoes.headers || {}) };
  const token = tokenAtual();
  if (token) headers.authorization = `Bearer ${token}`;
  let resp;
  try {
    resp = await fetch(`/v1/admin${caminho}`, { ...opcoes, headers });
  } catch {
    throw new Error('servidor_inacessivel');
  }
  if (resp.status === 401 && caminho !== '/login') {
    salvarToken(null);
    localStorage.removeItem('pc_admin_sessao');
    window.location.reload();
    throw new Error('sessao_expirada');
  }
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const erro = new Error(corpo.erro || 'erro_desconhecido');
    erro.codigo = corpo.erro;
    throw erro;
  }
  return corpo;
}

export async function exportarFicha(id, formato) {
  const token = tokenAtual();
  const resp = await fetch(`/v1/admin/clientes/${id}/exportar?formato=${formato}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error('erro_exportacao');
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cliente-${id}.${formato}`;
  a.click();
  URL.revokeObjectURL(url);
}
