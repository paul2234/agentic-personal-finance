import { config as loadDotEnv } from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';

import { waitForEndpointReachable } from '../../support/wait-for-endpoint';

loadDotEnv();

const hasDatabase: boolean = Boolean(process.env.DATABASE_URL);
const runEdgeIntegration: boolean = process.env.RUN_EDGE_E2E === '1';
const shouldRunIntegration: boolean = hasDatabase && runEdgeIntegration;
const createAccountsBatchUrl = 'http://127.0.0.1:54321/functions/v1/create-accounts-batch';

describe('Create accounts batch integration', () => {
  beforeAll(async () => {
    if (!shouldRunIntegration) {
      return;
    }

    const reachable = await waitForEndpointReachable(createAccountsBatchUrl);
    if (!reachable) {
      throw new Error(
        'create-accounts-batch is not reachable. Run `supabase start` and `npm run service:dev`.',
      );
    }
  });

  it.skipIf(!shouldRunIntegration)('creates regular accounts and rejects contra without confirmation', async () => {
    const suffix = Date.now().toString().slice(-6);
    const response = await fetch(createAccountsBatchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accounts: [
          {
            code: `18${suffix}`,
            name: `Batch Account ${suffix}`,
            accountType: 'ASSET',
            normalSide: 'DEBIT',
          },
          {
            code: `19${suffix}`,
            name: `Contra Batch ${suffix}`,
            accountType: 'ASSET',
            normalSide: 'CREDIT',
          },
        ],
      }),
    });

    const payload = await response.json() as {
      success: boolean;
      data?: {
        attemptedCount: number;
        createdCount: number;
        contraRejectedCount: number;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data?.attemptedCount).toBe(2);
    expect(payload.data?.createdCount).toBe(1);
    expect(payload.data?.contraRejectedCount).toBe(1);
  });
});
