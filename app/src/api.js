import AsyncStorage from '@react-native-async-storage/async-storage';

let BASE_URL = 'http://10.0.2.2:3000';

export async function definirBaseUrl(url) {
  BASE_URL = url.replace(/\/$/, '');
  await AsyncStorage.setItem('base_url', BASE_URL);
}

export async function carregarBaseUrl() {
  const salva = await AsyncStorage.getItem('base_url');
  if (salva) BASE_URL = salva;
  return BASE_URL;
}

export async function tokenAtual() {
  return AsyncStorage.getItem('token');
}

export async function salvarSessao(token) {
  if (token) await AsyncStorage.setItem('token', token);
  else await AsyncStorage.removeItem('token');
}

export async function api(caminho, opcoes = {}) {
  const token = await tokenAtual();
  const headers = { 'content-type': 'application/json', ...(opcoes.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const resp = await fetch(`${BASE_URL}/v1/admin${caminho}`, { ...opcoes, headers });
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const erro = new Error(corpo.erro || 'erro_desconhecido');
    erro.codigo = corpo.erro;
    erro.status = resp.status;
    throw erro;
  }
  return corpo;
}
