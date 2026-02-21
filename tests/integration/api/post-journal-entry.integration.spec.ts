import { config as loadDotEnv } from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';

import { waitForEndpointReachable } from '../../support/wait-for-endpoint';

loadDotEnv();

const hasDatabase: boolean = Boolean(process.env.DATABASE_URL);
const runEdgeIntegration: boolean = process.env.RUN_EDGE_E2E === '1';
const shouldRunIntegration: boolean = hasDatabase && runEdgeIntegration;
const postJournalEntryUrl = 'http://127.0.0.1:54321/functions/v1/post-journal-entry';

describe('Post journal entry integration', () => {
  beforeAll(async () => {
    if (!shouldRunIntegration) {
      return;
    }

    const reachable = await waitForEndpointReachable(postJournalEntryUrl);
    if (!reachable) {
      throw new Error(
        'post-journal-entry is not reachable. Run `supabase start` and `npm run service:dev`.',
      );
    }
  });

  it.skipIf(!shouldRunIntegration)('posts a balanced journal via edge endpoint', async () => {
    const response = await fetch(postJournalEntryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        entryDate: '2026-02-20',
        memo: 'integration api happy path',
        lines: [
          { accountCode: '5200', type: 'DEBIT', amount: '12.34' },
          { accountCode: '1000', type: 'CREDIT', amount: '12.34' },
        ],
      }),
    });

    const payload = await response.json() as {
      success: boolean;
      data?: { journalEntryId: string; journalNumber: string };
      error?: { code: string; message: string };
    };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data?.journalEntryId).toEqual(expect.any(String));
    expect(payload.data?.journalNumber).toMatch(/^JRN-/);
  });

  it.skipIf(!shouldRunIntegration)('rejects an unbalanced journal via edge endpoint', async () => {
    const response = await fetch(postJournalEntryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        entryDate: '2026-02-20',
        memo: 'integration api unbalanced path',
        lines: [
          { accountCode: '5200', type: 'DEBIT', amount: '12.34' },
          { accountCode: '1000', type: 'CREDIT', amount: '12.33' },
        ],
      }),
    });

    const payload = await response.json() as {
      success: boolean;
      data?: unknown;
      error?: { code: string; message: string };
    };

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBe('UNBALANCED_ENTRY');
  });
});
