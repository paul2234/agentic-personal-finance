import { spawn } from 'node:child_process';

import { config as loadDotEnv } from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';

loadDotEnv();

const projectRoot: string = process.cwd();
const hasDatabase: boolean = Boolean(process.env.DATABASE_URL);
const runEdgeE2E: boolean = process.env.RUN_EDGE_E2E === '1';
const shouldRunE2E: boolean = hasDatabase && runEdgeE2E;
const getAccountsUrl = 'http://127.0.0.1:54321/functions/v1/get-accounts';

async function waitForGetAccountsReachable(): Promise<boolean> {
  const maxAttempts = 30;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(getAccountsUrl, {
        signal: AbortSignal.timeout(3000),
      });

      if (response.status >= 100) {
        return true;
      }
    } catch {
      // Keep polling while local function boots.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

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

describe('Accounts list E2E', () => {
  beforeAll(async () => {
    if (!shouldRunE2E) {
      return;
    }

    const reachable = await waitForGetAccountsReachable();
    if (!reachable) {
      throw new Error(
        'Local edge function is not reachable. Start services with `supabase start` and `npm run service:dev`.',
      );
    }
  });

  it.skipIf(!shouldRunE2E)('returns accounts from CLI via edge function', async () => {
    const result = await runCliCommand(['accounts', 'list', '--json']);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');

    const payload: unknown = JSON.parse(result.stdout);
    expect(Array.isArray(payload)).toBe(true);

    const accounts = payload as Array<{ code: string; name: string }>;
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts.some((account) => account.code === '1000')).toBe(true);
  });
});
