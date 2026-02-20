import { config as loadDotEnv } from 'dotenv';
import { describe, expect, it } from 'vitest';

import { AccountRepository } from '../../../src/db/repositories/account-repository';

loadDotEnv();

const hasDatabase: boolean = Boolean(process.env.DATABASE_URL);

describe('Get accounts integration', () => {
  it.runIf(hasDatabase)('returns household accounts sorted by code', async () => {
    const accountRepository = new AccountRepository();
    const accounts = await accountRepository.listAccounts();

    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts[0].code).toBe('1000');
    expect(accounts.some((account) => account.code === '5200')).toBe(true);

    const codes = accounts.map((account) => account.code);
    const sorted = [...codes].sort((a, b) => a.localeCompare(b));
    expect(codes).toEqual(sorted);
  });
});
