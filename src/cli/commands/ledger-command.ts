import { readFile } from 'node:fs/promises';

import { Command } from 'commander';

import { ServiceClient } from '../client/service-client';
import { printData, printError } from '../output/format';
import { postEntrySchema } from '../schemas/post-entry-schema';

interface PostEntryCommandOptions {
  file: string;
  json?: boolean;
}

export function createLedgerCommand(): Command {
  const command = new Command('ledger');

  command
    .command('post-entry')
    .description('Post a balanced journal entry from a JSON file')
    .requiredOption('-f, --file <path>', 'Path to input JSON file')
    .option('--json', 'Output as machine-readable JSON')
    .action(async (options: PostEntryCommandOptions): Promise<void> => {
      const jsonOutput: boolean = Boolean(options.json);

      try {
        const fileContent: string = await readFile(options.file, 'utf8');
        const parsed: unknown = JSON.parse(fileContent);
        const payload = postEntrySchema.parse(parsed);

        const serviceClient = new ServiceClient();
        const result = await serviceClient.postJournalEntry(payload);

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
