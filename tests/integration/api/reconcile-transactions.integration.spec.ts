import { config as loadDotEnv } from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createTransactionFixture,
  getTransactionReconciliationState,
} from '../../support/transaction-fixture';
import { waitForEndpointReachable } from '../../support/wait-for-endpoint';

loadDotEnv();

const hasDatabase: boolean = Boolean(process.env.DATABASE_URL);
const runEdgeIntegration: boolean = process.env.RUN_EDGE_E2E === '1';
const shouldRunIntegration: boolean = hasDatabase && runEdgeIntegration;
const reconcileUrl = 'http://127.0.0.1:54321/functions/v1/reconcile-transactions';

describe('Reconcile transactions integration', () => {
  beforeAll(async () => {
    if (!shouldRunIntegration) {
      return;
    }

    const reachable = await waitForEndpointReachable(reconcileUrl);
    if (!reachable) {
      throw new Error(
        'reconcile-transactions is not reachable. Run `supabase start` and `npm run service:dev`.',
      );
    }
  });

  it.skipIf(!shouldRunIntegration)('requires idempotency key header', async () => {
    const response = await fetch(reconcileUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const payload = await response.json() as {
      success: boolean;
      error?: { code: string; message: string };
    };

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBe('IDEMPOTENCY_REQUIRED');
  });

  it.skipIf(!shouldRunIntegration)('reconciles partially then fully and updates status', async () => {
    const transaction = await createTransactionFixture('1000', '-100.00', 'integration reconcile partial/full');

    const partialResponse = await fetch(reconcileUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `reconcile-partial-${transaction.id}`,
      },
      body: JSON.stringify({
        entryDate: '2026-02-22',
        memo: 'partial reconcile',
        transactionAllocations: [
          {
            transactionId: transaction.id,
            amountApplied: '70.00',
          },
        ],
        journalLines: [
          { accountCode: '5200', type: 'DEBIT', amount: '70.00' },
          { accountCode: '1000', type: 'CREDIT', amount: '70.00' },
        ],
      }),
    });

    const partialPayload = await partialResponse.json() as {
      success: boolean;
      error?: { code: string; message: string };
    };

    expect(partialResponse.status).toBe(200);
    expect(partialPayload.success).toBe(true);

    const partialState = await getTransactionReconciliationState(transaction.id);
    expect(partialState.allocatedAmount).toBe('70.0000');
    expect(partialState.reconciliationStatus).toBe('PARTIALLY_RECONCILED');

    const finalResponse = await fetch(reconcileUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `reconcile-final-${transaction.id}`,
      },
      body: JSON.stringify({
        entryDate: '2026-02-22',
        memo: 'final reconcile',
        transactionAllocations: [
          {
            transactionId: transaction.id,
            amountApplied: '30.00',
          },
        ],
        journalLines: [
          { accountCode: '5200', type: 'DEBIT', amount: '30.00' },
          { accountCode: '1000', type: 'CREDIT', amount: '30.00' },
        ],
      }),
    });

    const finalPayload = await finalResponse.json() as {
      success: boolean;
      error?: { code: string; message: string };
    };

    expect(finalResponse.status).toBe(200);
    expect(finalPayload.success).toBe(true);

    const finalState = await getTransactionReconciliationState(transaction.id);
    expect(finalState.allocatedAmount).toBe('100.0000');
    expect(finalState.reconciliationStatus).toBe('FULLY_RECONCILED');
  });

  it.skipIf(!shouldRunIntegration)('rejects over-allocation', async () => {
    const transaction = await createTransactionFixture('1000', '-50.00', 'integration reconcile over allocation');

    const response = await fetch(reconcileUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `reconcile-over-${transaction.id}`,
      },
      body: JSON.stringify({
        entryDate: '2026-02-22',
        memo: 'over allocate',
        transactionAllocations: [
          {
            transactionId: transaction.id,
            amountApplied: '51.00',
          },
        ],
        journalLines: [
          { accountCode: '5200', type: 'DEBIT', amount: '51.00' },
          { accountCode: '1000', type: 'CREDIT', amount: '51.00' },
        ],
      }),
    });

    const payload = await response.json() as {
      success: boolean;
      error?: { code: string; message: string };
    };

    expect(response.status).toBe(409);
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBe('OVER_ALLOCATED');
  });

  it.skipIf(!shouldRunIntegration)('rejects unbalanced journal lines', async () => {
    const transaction = await createTransactionFixture('1000', '-60.00', 'integration reconcile unbalanced');

    const response = await fetch(reconcileUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `reconcile-unbalanced-${transaction.id}`,
      },
      body: JSON.stringify({
        entryDate: '2026-02-22',
        memo: 'unbalanced',
        transactionAllocations: [
          {
            transactionId: transaction.id,
            amountApplied: '60.00',
          },
        ],
        journalLines: [
          { accountCode: '5200', type: 'DEBIT', amount: '60.00' },
          { accountCode: '1000', type: 'CREDIT', amount: '59.00' },
        ],
      }),
    });

    const payload = await response.json() as {
      success: boolean;
      error?: { code: string; message: string };
    };

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBe('UNBALANCED_ENTRY');
  });
});
