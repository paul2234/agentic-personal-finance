import { describe, expect, it } from 'vitest';

import { createAccountsBatchSchema } from '../../../../src/cli/schemas/create-accounts-batch-schema';

describe('createAccountsBatchSchema', () => {
  it('accepts valid account batch payload', () => {
    const parsed = createAccountsBatchSchema.parse({
      accounts: [
        {
          code: '1500',
          name: 'Prepaid Expense',
          accountType: 'ASSET',
          normalSide: 'DEBIT',
        },
      ],
    });

    expect(parsed.accounts.length).toBe(1);
    expect(parsed.accounts[0].code).toBe('1500');
  });

  it('rejects empty account list', () => {
    expect(() =>
      createAccountsBatchSchema.parse({
        accounts: [],
      }),
    ).toThrow();
  });
});
