import { describe, expect, it } from 'vitest';

import { mapAccountRow } from '../../../../src/api/get-accounts/map-account-row';

describe('mapAccountRow', () => {
  it('maps database account row to API shape', () => {
    const mapped = mapAccountRow({
      id: '711b7400-4cc4-4aaa-8365-90b5d46af0a4',
      code: '1000',
      name: 'Cash Checking',
      account_type: 'ASSET',
      normal_side: 'DEBIT',
      is_active: true,
    });

    expect(mapped).toEqual({
      id: '711b7400-4cc4-4aaa-8365-90b5d46af0a4',
      code: '1000',
      name: 'Cash Checking',
      accountType: 'ASSET',
      normalSide: 'DEBIT',
      isActive: true,
    });
  });
});
