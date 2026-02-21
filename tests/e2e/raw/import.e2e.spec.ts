import { spawn } from 'node:child_process';

import { config as loadDotEnv } from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';

import { waitForEndpointReachable } from '../../support/wait-for-endpoint';

loadDotEnv();

const projectRoot: string = process.cwd();
const hasDatabase: boolean = Boolean(process.env.DATABASE_URL);
const runEdgeE2E: boolean = process.env.RUN_EDGE_E2E === '1';
const shouldRunE2E: boolean = hasDatabase && runEdgeE2E;
const importRawTransactionsUrl = 'http://127.0.0.1:54321/functions/v1/import-raw-transactions';

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

describe('Raw import E2E', () => {
  beforeAll(async () => {
    if (!shouldRunE2E) {
      return;
    }

    const reachable = await waitForEndpointReachable(importRawTransactionsUrl);
    if (!reachable) {
      throw new Error(
        'import-raw-transactions is not reachable. Run `supabase start` and `npm run service:dev`.',
      );
    }
  });

  it.skipIf(!shouldRunE2E)('imports sample raw transactions through CLI', async () => {
    const result = await runCliCommand([
      'raw',
      'import',
      '--file',
      './examples/raw-transactions.json',
      '--json',
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');

    const payload = JSON.parse(result.stdout) as {
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

    expect(payload.success).toBe(true);
    expect(payload.data?.importBatchId).toEqual(expect.any(String));
    expect(payload.data?.attemptedCount).toBeGreaterThan(0);
  });
});
