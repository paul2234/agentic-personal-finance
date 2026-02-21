import { readFile } from 'node:fs/promises';

import { Command } from 'commander';

import { ServiceClient } from '../client/service-client';
import { printData, printError } from '../output/format';
import { importRawTransactionsSchema } from '../schemas/import-raw-transactions-schema';

interface ImportRawOptions {
  file: string;
  json?: boolean;
}

export function createRawCommand(): Command {
  const command = new Command('raw');

  command
    .command('import')
    .description('Import raw bank/credit-card transactions from a JSON file')
    .requiredOption('-f, --file <path>', 'Path to raw transaction JSON file')
    .option('--json', 'Output as machine-readable JSON')
    .action(async (options: ImportRawOptions): Promise<void> => {
      const jsonOutput: boolean = Boolean(options.json);

      try {
        const fileContent: string = await readFile(options.file, 'utf8');
        const parsed: unknown = JSON.parse(fileContent);
        const payload = importRawTransactionsSchema.parse(parsed);

        const serviceClient = new ServiceClient();
        const result = await serviceClient.importRawTransactions(payload);

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
