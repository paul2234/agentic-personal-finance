import { readFile } from 'node:fs/promises';

import { Command } from 'commander';

import { ServiceClient } from '../client/service-client';
import { printData, printError } from '../output/format';
import { reconcileTransactionsSchema } from '../schemas/reconcile-transactions-schema';

interface ReconcilePostOptions {
  file: string;
  json?: boolean;
}

export function createReconcileCommand(): Command {
  const command = new Command('reconcile');

  command
    .command('post')
    .description('Reconcile raw transactions by posting a balanced journal from a JSON file')
    .requiredOption('-f, --file <path>', 'Path to reconciliation JSON file')
    .option('--json', 'Output as machine-readable JSON')
    .action(async (options: ReconcilePostOptions): Promise<void> => {
      const jsonOutput: boolean = Boolean(options.json);

      try {
        const fileContent: string = await readFile(options.file, 'utf8');
        const parsed: unknown = JSON.parse(fileContent);
        const payload = reconcileTransactionsSchema.parse(parsed);

        const serviceClient = new ServiceClient();
        const result = await serviceClient.reconcileTransactions(payload);

        printData(
          {
            success: true,
            data: result,
          },
          jsonOutput,
        );
      } catch (error) {
        printError(error, jsonOutput);
        process.exitCode = 1;
      }
    });

  return command;
}
