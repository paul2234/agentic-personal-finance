import { readFile } from 'node:fs/promises';

import { Command } from 'commander';

import { ServiceClient } from '../client/service-client';
import { printData, printError } from '../output/format';
import { createAccountsBatchSchema } from '../schemas/create-accounts-batch-schema';
import { createAccountSchema } from '../schemas/create-account-schema';

interface AccountListOptions {
  json?: boolean;
}

interface AccountCreateOptions {
  code?: string;
  name?: string;
  type?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  normalSide?: 'DEBIT' | 'CREDIT';
  fromFile?: string;
  allowContra?: boolean;
  createdBy?: string;
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

  command
    .command('create')
    .description('Create a new account in the chart of accounts')
    .option('--code <code>', 'Account code (for example: 1500)')
    .option('--name <name>', 'Account display name')
    .option('--type <type>', 'Account type: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE')
    .option('--normal-side <side>', 'Normal side: DEBIT or CREDIT')
    .option('--from-file <path>', 'Create multiple accounts from a JSON file')
    .option('--allow-contra', 'Allow contra account normal-side mismatch')
    .option('--created-by <uuid>', 'Creator user ID for audit trail')
    .option('--json', 'Output as machine-readable JSON')
    .action(async (options: AccountCreateOptions): Promise<void> => {
      const jsonOutput: boolean = Boolean(options.json);

      try {
        const serviceClient = new ServiceClient();

        if (options.fromFile) {
          const fileContent: string = await readFile(options.fromFile, 'utf8');
          const parsed: unknown = JSON.parse(fileContent);

          const batchPayload = createAccountsBatchSchema.parse(parsed);
          const requestPayload = {
            createdBy: options.createdBy ?? batchPayload.createdBy,
            allowContraByDefault: Boolean(options.allowContra) || Boolean(batchPayload.allowContraByDefault),
            accounts: batchPayload.accounts,
          };

          const result = await serviceClient.createAccountsBatch(requestPayload);
          printData({ success: true, data: result }, jsonOutput);
          return;
        }

        if (!options.code || !options.name || !options.type || !options.normalSide) {
          throw new Error(
            'For single account creation provide --code, --name, --type, and --normal-side, or use --from-file.',
          );
        }

        const payload = createAccountSchema.parse({
          code: options.code,
          name: options.name,
          accountType: options.type,
          normalSide: options.normalSide,
          allowContra: Boolean(options.allowContra),
          createdBy: options.createdBy,
        });

        const created = await serviceClient.createAccount(payload);
        printData({ success: true, data: created }, jsonOutput);
      } catch (error) {
        printError(error, jsonOutput);
        process.exitCode = 1;
      }
    });

  return command;
}
