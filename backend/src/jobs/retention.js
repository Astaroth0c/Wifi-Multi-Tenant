import { executarExpurgo } from '../services/expurgo.js';

const INTERVALO_MS = 24 * 3600 * 1000;

export function iniciarAgendadorExpurgo() {
  const rodar = async () => {
    try {
      const removidas = await executarExpurgo();
      if (removidas.length) console.log('[expurgo] particoes removidas:', removidas.join(', '));
    } catch (err) {
      console.error('[expurgo] falhou:', err.message);
    }
  };
  setTimeout(rodar, 60 * 1000).unref();
  const timer = setInterval(rodar, INTERVALO_MS);
  timer.unref();
}
