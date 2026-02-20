import { Command } from 'commander';

import { AccountRepository } from '../../db/repositories/account-repository';
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
        const accountRepository = new AccountRepository();
        const accounts = await accountRepository.listAccounts();
        printData(accounts, jsonOutput);
      } catch (error) {
        printError(error, jsonOutput);
        process.exitCode = 1;
      }
    });

  return command;
}
