import { describe, expect, it } from 'vitest';

import { importTransactionsSchema } from '../../../../src/cli/schemas/import-transactions-schema';

describe('importTransactionsSchema', () => {
  it('accepts a valid transaction import payload', () => {
    const parsed = importTransactionsSchema.parse({
      source: 'bank-csv',
      accountCode: '1000',
      transactions: [
        {
          externalId: 'txn-1',
          occurredAt: '2026-02-18T15:11:00Z',
          amount: '-84.73',
          currencyCode: 'USD',
        },
      ],
    });

    expect(parsed.accountCode).toBe('1000');
    expect(parsed.transactions.length).toBe(1);
  });

  it('rejects invalid amount format', () => {
    expect(() =>
      importTransactionsSchema.parse({
        source: 'bank-csv',
        accountCode: '1000',
        transactions: [
          {
            externalId: 'txn-1',
            occurredAt: '2026-02-18T15:11:00Z',
            amount: '84,73',
            currencyCode: 'USD',
          },
        ],
      }),
    ).toThrow();
  });
});
