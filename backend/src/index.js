import { config } from './config.js';
import { buildApp } from './app.js';
import { iniciarAgendadorExpurgo } from './jobs/retention.js';

const app = await buildApp({ logger: true });
await app.listen({ port: config.port, host: config.host });
iniciarAgendadorExpurgo();

for (const s of ['SIGINT', 'SIGTERM']) {
  process.on(s, async () => {
    await app.close();
    process.exit(0);
  });
}
