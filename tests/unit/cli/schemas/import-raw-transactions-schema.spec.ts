import { describe, expect, it } from 'vitest';

import { importRawTransactionsSchema } from '../../../../src/cli/schemas/import-raw-transactions-schema';

describe('importRawTransactionsSchema', () => {
  it('accepts a valid raw transaction import payload', () => {
    const parsed = importRawTransactionsSchema.parse({
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
      importRawTransactionsSchema.parse({
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
