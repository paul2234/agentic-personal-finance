import { readFile } from 'node:fs/promises';

import { Command } from 'commander';

import { ServiceClient } from '../client/service-client';
import { printData, printError } from '../output/format';
import { importTransactionsSchema } from '../schemas/import-transactions-schema';

interface ImportTransactionsOptions {
  file: string;
  json?: boolean;
}

export function createTransactionsCommand(): Command {
  const command = new Command('transactions');

  command
    .command('import')
    .description('Import bank/credit-card transactions from a JSON file')
    .requiredOption('-f, --file <path>', 'Path to transaction JSON file')
    .option('--json', 'Output as machine-readable JSON')
    .action(async (options: ImportTransactionsOptions): Promise<void> => {
      const jsonOutput: boolean = Boolean(options.json);

      try {
        const fileContent: string = await readFile(options.file, 'utf8');
        const parsed: unknown = JSON.parse(fileContent);
        const payload = importTransactionsSchema.parse(parsed);

        const serviceClient = new ServiceClient();
        const result = await serviceClient.importTransactions(payload);

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
