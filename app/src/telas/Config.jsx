import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { api, definirBaseUrl, carregarBaseUrl } from '../api.js';

export default function Config() {
  const [cfg, setCfg] = useState(null);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    (async () => {
      setUrl(await carregarBaseUrl());
      try {
        setCfg(await api('/config'));
      } catch (e) {
        setErro(e.message);
      }
    })();
  }, []);

  async function salvar() {
    setErro(null);
    setOk(false);
    try {
      const r = await api('/config', {
        method: 'PUT',
        body: JSON.stringify({
          configuracoes: {
            limite_diario_minutos: Number(cfg.configuracoes?.limite_diario_minutos ?? 120),
            bloqueio_adulto: cfg.configuracoes?.bloqueio_adulto !== false,
          },
        }),
      });
      setCfg((c) => ({ ...c, ...r }));
      setOk(true);
    } catch (e) {
      setErro(e.message);
    }
  }

  if (!cfg) return <View style={estilos.caixa}>{erro ? <Text style={estilos.erro}>{erro}</Text> : <ActivityIndicator />}</View>;

  const c = cfg.configuracoes || {};

  return (
    <View style={estilos.caixa}>
      <Text style={estilos.nome}>{cfg.nome}</Text>
      <Text style={estilos.rotulo}>Servidor da API</Text>
      <TextInput
        style={estilos.campo} value={url} autoCapitalize="none"
        placeholder="http://192.168.1.50:3000"
        onChangeText={setUrl}
        onEndEditing={(e) => definirBaseUrl(e.nativeEvent.text)}
      />
      <Text style={estilos.rotulo}>Limite diário (minutos)</Text>
      <TextInput
        style={estilos.campo} keyboardType="number-pad"
        defaultValue={String(c.limite_diario_minutos ?? 120)}
        onEndEditing={(e) => setCfg((atual) => ({
          ...atual,
          configuracoes: { ...atual.configuracoes, limite_diario_minutos: e.nativeEvent.text },
        }))}
      />
      <View style={estilos.linhaSwitch}>
        <Text>Bloqueio adulto</Text>
        <Switch
          value={c.bloqueio_adulto !== false}
          onValueChange={(v) => setCfg((atual) => ({
            ...atual,
            configuracoes: { ...atual.configuracoes, bloqueio_adulto: v },
          }))}
        />
      </View>
      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
      {ok ? <Text style={estilos.ok}>Configuração salva.</Text> : null}
      <Button title="Salvar" onPress={salvar} />
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: { flex: 1, padding: 16, gap: 8 },
  nome: { fontSize: 18, fontWeight: '700' },
  rotulo: { fontSize: 12, color: '#475569', marginTop: 8 },
  campo: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10 },
  linhaSwitch: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  ok: { color: '#16a34a' },
  erro: { color: '#dc2626' },
});
