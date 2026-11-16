import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { api } from '../api.js';

export default function Logs() {
  const [logs, setLogs] = useState(null);
  const [cadeia, setCadeia] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await api('/logs?page=1');
        if (vivo) setLogs(r.logs);
      } catch (e) {
        if (vivo) setErro(e.message);
        return;
      }
      try {
        const c = await api('/logs/cadeia');
        if (vivo) setCadeia(c);
      } catch {
        /* admins da rede precisam escolher tenant; indicador fica oculto */
      }
    })();
    return () => { vivo = false; };
  }, []);

  return (
    <View style={estilos.caixa}>
      {cadeia && (
        <Text style={cadeia.integra ? estilos.ok : estilos.erro}>
          Cadeia de hash: {cadeia.integra ? 'íntegra' : 'QUEBRADA'}
        </Text>
      )}
      {erro && <Text style={estilos.erro}>{erro}</Text>}
      {!logs && !erro && <ActivityIndicator />}
      <FlatList
        data={logs || []}
        keyExtractor={(l) => String(l.id)}
        ListEmptyComponent={<Text>Nenhum log recente.</Text>}
        renderItem={({ item }) => (
          <View style={estilos.linha}>
            <Text style={estilos.nome} numberOfLines={1}>{item.dominio || item.tipo}</Text>
            <Text>{item.acao}{item.categoria ? ` · ${item.categoria}` : ''} · {new Date(item.ts).toLocaleString('pt-BR')}</Text>
          </View>
        )}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: { flex: 1, padding: 16, gap: 8 },
  linha: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8, gap: 2 },
  nome: { fontWeight: '700' },
  ok: { color: '#16a34a', fontWeight: '700' },
  erro: { color: '#dc2626' },
});
