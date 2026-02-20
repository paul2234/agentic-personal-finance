import { describe, expect, it } from 'vitest';

import { UnbalancedEntryError } from '../../../src/domain/errors/accounting-error';
import { LedgerService } from '../../../src/ledger/post-journal-entry';

const hasDatabase: boolean = Boolean(process.env.DATABASE_URL);

describe('LedgerService integration', () => {
  it('rejects unbalanced entries before write', async () => {
    const ledgerService = new LedgerService();

    await expect(
      ledgerService.postEntry({
        entryDate: '2026-02-20',
        memo: 'integration-test',
        lines: [
          { accountCode: '1000', type: 'DEBIT', amount: '10.00' },
          { accountCode: '4000', type: 'CREDIT', amount: '9.00' },
        ],
      }),
    ).rejects.toBeInstanceOf(UnbalancedEntryError);
  });

  it.runIf(hasDatabase)('posts a balanced entry when accounts exist', async () => {
    const ledgerService = new LedgerService();

    await expect(
      ledgerService.postEntry({
        entryDate: '2026-02-20',
        memo: 'integration-test',
        lines: [
          { accountCode: '1000', type: 'DEBIT', amount: '10.00' },
          { accountCode: '4000', type: 'CREDIT', amount: '10.00' },
        ],
      }),
    ).resolves.toMatchObject({
      journalEntryId: expect.any(String),
      journalNumber: expect.stringMatching(/^JRN-/),
    });
  });
});
