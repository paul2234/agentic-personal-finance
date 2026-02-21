import { config as loadDotEnv } from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';

import { waitForEndpointReachable } from '../../support/wait-for-endpoint';

loadDotEnv();

const hasDatabase: boolean = Boolean(process.env.DATABASE_URL);
const runEdgeIntegration: boolean = process.env.RUN_EDGE_E2E === '1';
const shouldRunIntegration: boolean = hasDatabase && runEdgeIntegration;
const importTransactionsUrl = 'http://127.0.0.1:54321/functions/v1/import-transactions';

describe('Import transactions integration', () => {
  beforeAll(async () => {
    if (!shouldRunIntegration) {
      return;
    }

    const reachable = await waitForEndpointReachable(importTransactionsUrl);
    if (!reachable) {
      throw new Error(
        'import-transactions is not reachable. Run `supabase start` and `npm run service:dev`.',
      );
    }
  });

  it.skipIf(!shouldRunIntegration)('imports valid transactions', async () => {
    const suffix = Date.now().toString();
    const response = await fetch(importTransactionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: 'bank-csv',
        accountCode: '1000',
        fileName: `integration-${suffix}.json`,
        transactions: [
          {
            externalId: `int-${suffix}-1`,
            occurredAt: '2026-02-20T01:00:00Z',
            description: 'Integration transaction 1',
            amount: '-10.50',
            currencyCode: 'USD',
          },
          {
            externalId: `int-${suffix}-2`,
            occurredAt: '2026-02-20T02:00:00Z',
            description: 'Integration transaction 2',
            amount: '-4.25',
            currencyCode: 'USD',
          },
        ],
      }),
    });

    const payload = await response.json() as {
      success: boolean;
      data?: {
        importBatchId: string;
        accountId: string;
        attemptedCount: number;
        insertedCount: number;
        duplicateCount: number;
      };
      error?: { code: string; message: string };
    };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data?.importBatchId).toEqual(expect.any(String));
    expect(payload.data?.attemptedCount).toBe(2);
    expect(payload.data?.insertedCount).toBe(2);
    expect(payload.data?.duplicateCount).toBe(0);
  });
});
