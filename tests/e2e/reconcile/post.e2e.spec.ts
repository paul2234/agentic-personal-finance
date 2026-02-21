import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';

import { config as loadDotEnv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRawTransactionFixture } from '../../support/raw-transaction-fixture';
import { waitForEndpointReachable } from '../../support/wait-for-endpoint';

loadDotEnv();

const projectRoot: string = process.cwd();
const hasDatabase: boolean = Boolean(process.env.DATABASE_URL);
const runEdgeE2E: boolean = process.env.RUN_EDGE_E2E === '1';
const shouldRunE2E: boolean = hasDatabase && runEdgeE2E;
const reconcileUrl = 'http://127.0.0.1:54321/functions/v1/reconcile-transactions';

const tempFiles: string[] = [];

function runCliCommand(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const cliProcess = spawn('./node_modules/.bin/tsx', ['src/cli/main.ts', ...args], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ACCOUNTING_SERVICE_URL: 'http://127.0.0.1:54321/functions/v1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    cliProcess.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    cliProcess.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    cliProcess.on('close', (code: number | null) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function writeTempReconcilePayload(payload: Record<string, unknown>): Promise<string> {
  const filePath = `${projectRoot}/examples/.tmp-reconcile-${randomUUID()}.json`;
  tempFiles.push(filePath);
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

describe('Reconcile post E2E', () => {
  beforeAll(async () => {
    if (!shouldRunE2E) {
      return;
    }

    const reachable = await waitForEndpointReachable(reconcileUrl);
    if (!reachable) {
      throw new Error(
        'reconcile-transactions is not reachable. Run `supabase start` and `npm run service:dev`.',
      );
    }
  });

  afterAll(async () => {
    await Promise.all(tempFiles.map(async (filePath) => rm(filePath, { force: true })));
  });

  it.skipIf(!shouldRunE2E)('posts reconciliation from CLI and returns journal identifiers', async () => {
    const raw = await createRawTransactionFixture('1000', '-42.00', 'e2e reconcile success');

    const filePath = await writeTempReconcilePayload({
      entryDate: '2026-02-22',
      memo: 'e2e reconciliation success',
      rawTransactionAllocations: [
        {
          rawTransactionId: raw.id,
          amountApplied: '42.00',
        },
      ],
      journalLines: [
        { accountCode: '5200', type: 'DEBIT', amount: '42.00' },
        { accountCode: '1000', type: 'CREDIT', amount: '42.00' },
      ],
    });

    const result = await runCliCommand([
      'reconcile',
      'post',
      '--file',
      filePath,
      '--json',
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');

    const payload = JSON.parse(result.stdout) as {
      success: boolean;
      data?: { journalEntryId: string; journalNumber: string; allocationCount: number };
    };

    expect(payload.success).toBe(true);
    expect(payload.data?.journalEntryId).toEqual(expect.any(String));
    expect(payload.data?.journalNumber).toMatch(/^JRN-/);
    expect(payload.data?.allocationCount).toBe(1);
  });

  it.skipIf(!shouldRunE2E)('fails when attempting to over-allocate raw transaction', async () => {
    const raw = await createRawTransactionFixture('1000', '-25.00', 'e2e reconcile over allocation');

    const filePath = await writeTempReconcilePayload({
      entryDate: '2026-02-22',
      memo: 'e2e reconciliation over allocation',
      rawTransactionAllocations: [
        {
          rawTransactionId: raw.id,
          amountApplied: '30.00',
        },
      ],
      journalLines: [
        { accountCode: '5200', type: 'DEBIT', amount: '30.00' },
        { accountCode: '1000', type: 'CREDIT', amount: '30.00' },
      ],
    });

    const result = await runCliCommand([
      'reconcile',
      'post',
      '--file',
      filePath,
      '--json',
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});
