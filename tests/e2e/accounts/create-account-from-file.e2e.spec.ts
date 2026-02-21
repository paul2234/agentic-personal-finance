import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';

import { config as loadDotEnv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { waitForEndpointReachable } from '../../support/wait-for-endpoint';

loadDotEnv();

const projectRoot: string = process.cwd();
const hasDatabase: boolean = Boolean(process.env.DATABASE_URL);
const runEdgeE2E: boolean = process.env.RUN_EDGE_E2E === '1';
const shouldRunE2E: boolean = hasDatabase && runEdgeE2E;
const createAccountsBatchUrl = 'http://127.0.0.1:54321/functions/v1/create-accounts-batch';

let tempFilePath = '';

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

describe('Create account from file E2E', () => {
  beforeAll(async () => {
    if (!shouldRunE2E) {
      return;
    }

    const reachable = await waitForEndpointReachable(createAccountsBatchUrl);
    if (!reachable) {
      throw new Error(
        'create-accounts-batch is not reachable. Run `supabase start` and `npm run service:dev`.',
      );
    }

    const suffix = Date.now().toString().slice(-6);
    tempFilePath = `${projectRoot}/examples/.tmp-accounts-batch-${suffix}.json`;
    await writeFile(
      tempFilePath,
      JSON.stringify(
        {
          accounts: [
            {
              code: `24${suffix}`,
              name: `From File Asset ${suffix}`,
              accountType: 'ASSET',
              normalSide: 'DEBIT',
            },
            {
              code: `25${suffix}`,
              name: `From File Contra ${suffix}`,
              accountType: 'ASSET',
              normalSide: 'CREDIT',
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );
  });

  afterAll(async () => {
    if (!tempFilePath) {
      return;
    }

    await rm(tempFilePath, { force: true });
  });

  it.skipIf(!shouldRunE2E)('creates accounts from JSON file through CLI', async () => {
    const result = await runCliCommand([
      'accounts',
      'create',
      '--from-file',
      tempFilePath,
      '--allow-contra',
      '--json',
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');

    const payload = JSON.parse(result.stdout) as {
      success: boolean;
      data?: {
        attemptedCount: number;
        createdCount: number;
      };
    };

    expect(payload.success).toBe(true);
    expect(payload.data?.attemptedCount).toBe(2);
    expect(payload.data?.createdCount).toBe(2);
  });
});
