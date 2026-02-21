import { describe, expect, it } from 'vitest';

import { validateBalanced } from '../../../../supabase/functions/post-journal-entry/validate-balanced';

describe('validateBalanced', () => {
  it('accepts balanced lines and returns totals', () => {
    const totals = validateBalanced([
      { type: 'DEBIT', amount: '45.50' },
      { type: 'CREDIT', amount: '45.50' },
    ]);

    expect(totals).toEqual({
      debitTotal: '45.5000',
      creditTotal: '45.5000',
    });
  });

  it('throws unbalanced error payload', () => {
    expect(() =>
      validateBalanced([
        { type: 'DEBIT', amount: '45.50' },
        { type: 'CREDIT', amount: '44.50' },
      ]),
    ).toThrow(/UNBALANCED_ENTRY/);
  });
});
