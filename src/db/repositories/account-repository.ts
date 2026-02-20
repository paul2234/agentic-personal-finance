import { getPool } from '../client';
import type { AccountListItem } from '../../types/accounting';

interface AccountRow {
  id: string;
  code: string;
  name: string;
  account_type: string;
  normal_side: 'DEBIT' | 'CREDIT';
  is_active: boolean;
}

export class AccountRepository {
  public async findIdByCode(accountCode: string): Promise<string | null> {
    const pool = getPool();
    const result = await pool.query<{ id: string }>(
      `
        SELECT id
        FROM chart_of_accounts
        WHERE code = $1
          AND is_active = true
        LIMIT 1
      `,
      [accountCode],
    );

    return result.rows[0]?.id ?? null;
  }

  public async listAccounts(): Promise<AccountListItem[]> {
    const pool = getPool();
    const result = await pool.query<AccountRow>(
      `
        SELECT id, code, name, account_type, normal_side, is_active
        FROM chart_of_accounts
        ORDER BY code ASC
      `,
    );

    return result.rows.map((row): AccountListItem => ({
      id: row.id,
      code: row.code,
      name: row.name,
      accountType: row.account_type,
      normalSide: row.normal_side,
      isActive: row.is_active,
    }));
  }
}
