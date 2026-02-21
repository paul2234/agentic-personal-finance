import { describe, expect, it } from 'vitest';

import { createAccountSchema } from '../../../../src/cli/schemas/create-account-schema';

describe('createAccountSchema', () => {
  it('accepts valid account payload', () => {
    const parsed = createAccountSchema.parse({
      code: '1500',
      name: 'Prepaid Expense',
      accountType: 'ASSET',
      normalSide: 'DEBIT',
    });

    expect(parsed.code).toBe('1500');
    expect(parsed.accountType).toBe('ASSET');
  });

  it('rejects invalid normal side', () => {
    expect(() =>
      createAccountSchema.parse({
        code: '1501',
        name: 'Bad Account',
        accountType: 'ASSET',
        normalSide: 'LEFT',
      }),
    ).toThrow();
  });
});
