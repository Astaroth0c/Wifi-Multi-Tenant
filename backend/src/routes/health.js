import { query } from '../db.js';

export default async function healthRoutes(app) {
  app.get('/health', async () => {
    const r = await query('select 1 as ok');
    return { status: 'ok', banco: r.rows[0].ok === 1 };
  });
}
