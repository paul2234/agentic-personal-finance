import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const GET_ACCOUNTS_URL = 'http://127.0.0.1:54321/functions/v1/get-accounts';

export async function isFunctionsGatewayReachable(): Promise<boolean> {
  try {
    await fetch('http://127.0.0.1:54321/functions/v1');
    return true;
  } catch {
    return false;
  }
}

export interface EdgeFunctionProcess {
  stop: () => Promise<void>;
}

async function waitForGetAccountsEndpoint(): Promise<void> {
  const maxAttempts = 240;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(GET_ACCOUNTS_URL);
      if (response.ok || response.status === 401) {
        return;
      }
    } catch {
      // Continue polling.
    }

    await delay(500);
  }

  throw new Error('Timed out waiting for local get-accounts edge function.');
}

export async function startGetAccountsFunction(workdir: string): Promise<EdgeFunctionProcess> {
  const processHandle: ChildProcess = spawn(
    'supabase',
    ['functions', 'serve', 'get-accounts', '--no-verify-jwt', '--env-file', '.env'],
    {
      cwd: workdir,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let stderr = '';
  let stdout = '';

  processHandle.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });

  processHandle.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const exited = once(processHandle, 'exit').then(() => {
    throw new Error(
      `get-accounts function exited before startup.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  });

  await Promise.race([waitForGetAccountsEndpoint(), exited]);

  return {
    stop: async (): Promise<void> => {
      processHandle.kill('SIGTERM');
      await once(processHandle, 'exit');
    },
  };
}
