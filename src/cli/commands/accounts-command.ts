import { Command } from 'commander';

import { ServiceClient } from '../client/service-client';
import { printData, printError } from '../output/format';

interface AccountListOptions {
  json?: boolean;
}

export function createAccountsCommand(): Command {
  const command = new Command('accounts');

  command
    .command('list')
    .description('List chart of accounts')
    .option('--json', 'Output as machine-readable JSON')
    .action(async (options: AccountListOptions): Promise<void> => {
      const jsonOutput: boolean = Boolean(options.json);

      try {
        const serviceClient = new ServiceClient();
        const accounts = await serviceClient.listAccounts();
        printData(accounts, jsonOutput);
      } catch (error) {
        printError(error, jsonOutput);
        process.exitCode = 1;
      }
    });

  return command;
}
