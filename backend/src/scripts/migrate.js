import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const schema = await readFile(join(__dirname, '../../db/schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Schema aplicado com sucesso.');
  await pool.end();
}

main().catch((err) => {
  console.error('Falha na migracao:', err.message);
  process.exit(1);
});
