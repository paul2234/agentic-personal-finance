import { describe, expect, it } from 'vitest';

import { UnbalancedEntryError } from '../../../src/domain/errors/accounting-error';
import { validateJournalEntry } from '../../../src/ledger/validate-journal-entry';

describe('validateJournalEntry', () => {
  it('accepts balanced entries', () => {
    const totals = validateJournalEntry([
      { accountCode: '1000', type: 'DEBIT', amount: '100.00' },
      { accountCode: '4000', type: 'CREDIT', amount: '100.00' },
    ]);

    expect(totals.debitTotal).toBe('100.0000');
    expect(totals.creditTotal).toBe('100.0000');
  });

  it('rejects unbalanced entries', () => {
    expect(() =>
      validateJournalEntry([
        { accountCode: '1000', type: 'DEBIT', amount: '100.00' },
        { accountCode: '4000', type: 'CREDIT', amount: '99.99' },
      ]),
    ).toThrow(UnbalancedEntryError);
  });
});
