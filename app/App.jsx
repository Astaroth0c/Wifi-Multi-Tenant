import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Button, FlatList, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { api, salvarSessao, tokenAtual } from './src/api.js';
import TelaSessoes from './src/telas/Sessoes.jsx';
import TelaClientes from './src/telas/Clientes.jsx';
import TelaLogs from './src/telas/Logs.jsx';
import TelaConfig from './src/telas/Config.jsx';

const ABAS = [
  { id: 'sessoes', rotulo: 'Ao vivo', comp: TelaSessoes },
  { id: 'clientes', rotulo: 'Clientes', comp: TelaClientes },
  { id: 'logs', rotulo: 'Logs', comp: TelaLogs },
  { id: 'config', rotulo: 'Config', comp: TelaConfig },
];

export default function App() {
  const [token, setToken] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState('sessoes');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [totp, setTotp] = useState('');
  const [erro, setErro] = useState(null);
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    tokenAtual().then((t) => { setToken(t); setCarregando(false); });
  }, []);

  async function entrar() {
    setErro(null);
    setEntrando(true);
    try {
      const r = await api('/login', {
        method: 'POST',
        body: JSON.stringify({ email, senha, codigo_totp: totp }),
      });
      await salvarSessao(r.token);
      setToken(r.token);
    } catch (e) {
      setErro(e.message === 'totp_invalido' ? 'Código 2FA inválido.'
        : e.message === 'credenciais_invalidas' ? 'E-mail ou senha incorretos.'
        : `Erro: ${e.message}`);
    } finally {
      setEntrando(false);
    }
  }

  async function sair() {
    await salvarSessao(null);
    setToken(null);
  }

  if (carregando) {
    return <View style={estilos.central}><ActivityIndicator size="large" /></View>;
  }

  if (!token) {
    return (
      <ScrollView contentContainerStyle={estilos.central} style={estilos.base}>
        <Text style={estilos.titulo}>OrangeWifi — Admin</Text>
        <TextInput style={estilos.campo} placeholder="E-mail" autoCapitalize="none"
          keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={estilos.campo} placeholder="Senha" secureTextEntry value={senha} onChangeText={setSenha} />
        <TextInput style={estilos.campo} placeholder="Código 2FA (TOTP)" keyboardType="number-pad"
          maxLength={6} value={totp} onChangeText={setTotp} />
        {erro && <Text style={estilos.erro}>{erro}</Text>}
        {entrando
          ? <ActivityIndicator />
          : <Button title="Entrar" onPress={entrar} />}
      </ScrollView>
    );
  }

  const Ativa = (ABAS.find((a) => a.id === aba) || ABAS[0]).comp;

  return (
    <View style={estilos.base}>
      <View style={estilos.abas}>
        {ABAS.map((a) => (
          <Pressable key={a.id} onPress={() => setAba(a.id)}
            style={[estilos.aba, aba === a.id && estilos.abaAtiva]}>
            <Text style={aba === a.id ? estilos.abaTextoAtivo : estilos.abaTexto}>{a.rotulo}</Text>
          </Pressable>
        ))}
      </View>
      <Ativa />
      <View style={estilos.rodape}>
        <Button title="Sair e revogar sessão" color="#b91c1c" onPress={sair} />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  base: { flex: 1, backgroundColor: '#f1f5f9' },
  central: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  titulo: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  campo: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12 },
  erro: { color: '#dc2626' },
  abas: { flexDirection: 'row', backgroundColor: '#0f172a', paddingTop: 8 },
  aba: { flex: 1, alignItems: 'center', padding: 12 },
  abaAtiva: { borderBottomWidth: 3, borderBottomColor: '#1d4ed8' },
  abaTexto: { color: '#94a3b8' },
  abaTextoAtivo: { color: '#fff', fontWeight: '700' },
  rodape: { padding: 12 },
});
