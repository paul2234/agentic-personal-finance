import { describe, expect, it } from 'vitest';

import { reconcileTransactionsSchema } from '../../../../src/cli/schemas/reconcile-transactions-schema';

describe('reconcileTransactionsSchema', () => {
  it('accepts valid reconciliation payload', () => {
    const parsed = reconcileTransactionsSchema.parse({
      entryDate: '2026-02-22',
      transactionAllocations: [
        {
          transactionId: 'c5d32db2-f3f4-4319-9a52-2918ca2a4fbb',
          amountApplied: '1500.00',
        },
      ],
      journalLines: [
        { accountCode: '5200', type: 'DEBIT', amount: '1200.00' },
        { accountCode: '2100', type: 'DEBIT', amount: '300.00' },
        { accountCode: '1000', type: 'CREDIT', amount: '1500.00' },
      ],
    });

    expect(parsed.transactionAllocations.length).toBe(1);
    expect(parsed.journalLines.length).toBe(3);
  });

  it('rejects signed/negative allocation amount', () => {
    expect(() =>
      reconcileTransactionsSchema.parse({
        entryDate: '2026-02-22',
        transactionAllocations: [
          {
            transactionId: 'c5d32db2-f3f4-4319-9a52-2918ca2a4fbb',
            amountApplied: '-1500.00',
          },
        ],
        journalLines: [
          { accountCode: '5200', type: 'DEBIT', amount: '1500.00' },
          { accountCode: '1000', type: 'CREDIT', amount: '1500.00' },
        ],
      }),
    ).toThrow();
  });
});
