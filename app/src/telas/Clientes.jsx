import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Button, FlatList, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { api } from '../api.js';

export default function Clientes() {
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState(null);

  async function carregar(termo = busca) {
    try {
      setErro(null);
      const p = termo ? `?busca=${encodeURIComponent(termo)}` : '';
      const r = await api(`/clientes${p}`);
      setLista(r.clientes);
    } catch (e) {
      setErro(e.message);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function alternarStatus(c) {
    const novo = c.status === 'ativo' ? 'suspenso' : 'ativo';
    try {
      await api(`/clientes/${c.id}`, { method: 'PATCH', body: JSON.stringify({ status: novo }) });
      await carregar();
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  async function excluir(c) {
    Alert.alert('Excluir cliente', `Anonimizar ${c.nome}? Os logs são preservados.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async () => {
          try {
            await api(`/clientes/${c.id}`, { method: 'DELETE' });
            await carregar();
          } catch (e) {
            Alert.alert('Erro', e.message);
          }
        },
      },
    ]);
  }

  return (
    <View style={estilos.caixa}>
      <TextInput
        style={estilos.campo} placeholder="Buscar por nome ou e-mail"
        value={busca} onChangeText={setBusca}
        onSubmitEditing={() => carregar()} autoCapitalize="none"
      />
      {erro && <Text style={estilos.erro}>{erro}</Text>}
      {!lista && !erro && <ActivityIndicator />}
      <FlatList
        data={lista || []}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <View style={estilos.linha}>
            <Text style={estilos.nome}>{item.nome} <Text style={estilos.badge}>{item.status}</Text></Text>
            <Text>{item.email}</Text>
            <View style={estilos.acoes}>
              <Button title={item.status === 'ativo' ? 'Suspender' : 'Reativar'}
                onPress={() => alternarStatus(item)} />
              <Button title="Excluir" color="#b91c1c" onPress={() => excluir(item)} />
            </View>
          </View>
        )}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: { flex: 1, padding: 16, gap: 8 },
  campo: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10 },
  linha: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8, gap: 6 },
  nome: { fontWeight: '700' },
  badge: { fontSize: 12, color: '#1d4ed8' },
  acoes: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  erro: { color: '#dc2626' },
});
