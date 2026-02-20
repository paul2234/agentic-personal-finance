import { Pool, type PoolClient } from 'pg';

import { getConfig } from '../config/env';

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const config = getConfig();
    pool = new Pool({
      connectionString: config.databaseUrl,
      allowExitOnIdle: true,
    });
  }

  return pool;
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const db: Pool = getPool();
  const client: PoolClient = await db.connect();

  try {
    await client.query('BEGIN');
    const result: T = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
