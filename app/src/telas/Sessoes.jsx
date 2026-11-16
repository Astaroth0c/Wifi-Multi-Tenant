import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { api } from '../api.js';

export default function Sessoes() {
  const [sessoes, setSessoes] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    async function carregar() {
      try {
        const r = await api('/sessoes/ao-vivo');
        if (vivo) { setSessoes(r.sessoes); setErro(null); }
      } catch (e) {
        if (vivo) setErro(e.message);
      }
    }
    carregar();
    const t = setInterval(carregar, 15000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  if (erro) return <View style={estilos.caixa}><Text style={estilos.erro}>{erro}</Text></View>;
  if (!sessoes) return <ActivityIndicator style={estilos.caixa} />;

  return (
    <FlatList
      style={estilos.caixa}
      data={sessoes}
      keyExtractor={(s) => s.id}
      ListEmptyComponent={<Text>Nenhuma sessão ativa.</Text>}
      renderItem={({ item }) => (
        <View style={estilos.linha}>
          <Text style={estilos.nome}>{item.cliente}</Text>
          <Text>{item.mac} · {item.ip_interno}</Text>
          <Text>desde {new Date(item.inicio).toLocaleString('pt-BR')}</Text>
        </View>
      )}
    />
  );
}

const estilos = StyleSheet.create({
  caixa: { flex: 1, padding: 16 },
  linha: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8, gap: 2 },
  nome: { fontWeight: '700' },
  erro: { color: '#dc2626' },
});
