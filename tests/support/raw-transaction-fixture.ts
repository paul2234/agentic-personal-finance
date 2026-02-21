import { randomUUID } from 'node:crypto';

import { getPool } from '../../src/db/client';

export interface RawTransactionFixture {
  id: string;
  accountId: string;
  accountCode: string;
  amount: string;
}

export async function createRawTransactionFixture(
  accountCode: string,
  amount: string,
  description?: string,
): Promise<RawTransactionFixture> {
  const pool = getPool();

  const accountResult = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM chart_of_accounts
      WHERE code = $1
      LIMIT 1
    `,
    [accountCode],
  );

  const accountId = accountResult.rows[0]?.id;
  if (!accountId) {
    throw new Error(`Fixture account not found for code ${accountCode}`);
  }

  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO raw_transactions (
        source,
        external_id,
        occurred_at,
        description,
        amount,
        currency_code,
        metadata,
        account_id
      )
      VALUES ($1, $2, NOW(), $3, $4, 'USD', '{}'::jsonb, $5)
      RETURNING id
    `,
    [
      'test-fixture',
      `fixture-${randomUUID()}`,
      description ?? 'fixture raw transaction',
      amount,
      accountId,
    ],
  );

  return {
    id: result.rows[0].id,
    accountId,
    accountCode,
    amount,
  };
}

export async function getRawTransactionState(rawTransactionId: string): Promise<{
  allocatedAmount: string;
  reconciliationStatus: string;
}> {
  const pool = getPool();
  const result = await pool.query<{
    allocated_amount: string;
    reconciliation_status: string;
  }>(
    `
      SELECT allocated_amount, reconciliation_status
      FROM raw_transactions
      WHERE id = $1
      LIMIT 1
    `,
    [rawTransactionId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(`Raw transaction not found: ${rawTransactionId}`);
  }

  return {
    allocatedAmount: row.allocated_amount,
    reconciliationStatus: row.reconciliation_status,
  };
}
