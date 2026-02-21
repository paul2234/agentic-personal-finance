import { config as loadDotEnv } from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';

import { waitForEndpointReachable } from '../../support/wait-for-endpoint';

loadDotEnv();

const hasDatabase: boolean = Boolean(process.env.DATABASE_URL);
const runEdgeIntegration: boolean = process.env.RUN_EDGE_E2E === '1';
const shouldRunIntegration: boolean = hasDatabase && runEdgeIntegration;
const createAccountUrl = 'http://127.0.0.1:54321/functions/v1/create-account';

describe('Create account integration', () => {
  beforeAll(async () => {
    if (!shouldRunIntegration) {
      return;
    }

    const reachable = await waitForEndpointReachable(createAccountUrl);
    if (!reachable) {
      throw new Error('create-account is not reachable. Run `supabase start` and `npm run service:dev`.');
    }
  });

  it.skipIf(!shouldRunIntegration)('creates a regular account', async () => {
    const suffix = Date.now().toString().slice(-6);
    const response = await fetch(createAccountUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: `15${suffix}`,
        name: `Integration Asset ${suffix}`,
        accountType: 'ASSET',
        normalSide: 'DEBIT',
      }),
    });

    const payload = await response.json() as {
      success: boolean;
      data?: { id: string; code: string };
      error?: { code: string; message: string };
    };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data?.id).toEqual(expect.any(String));
  });

  it.skipIf(!shouldRunIntegration)('requires confirmation for contra account', async () => {
    const suffix = Date.now().toString().slice(-6);
    const response = await fetch(createAccountUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: `16${suffix}`,
        name: `Contra Asset ${suffix}`,
        accountType: 'ASSET',
        normalSide: 'CREDIT',
      }),
    });

    const payload = await response.json() as {
      success: boolean;
      error?: { code: string; message: string };
    };

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBe('CONTRA_CONFIRMATION_REQUIRED');
  });
});
