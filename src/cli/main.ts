#!/usr/bin/env node
import { Command } from 'commander';

import { createAccountsCommand } from './commands/accounts-command';
import { createLedgerCommand } from './commands/ledger-command';
import { createRawCommand } from './commands/raw-command';
import { createReconcileCommand } from './commands/reconcile-command';

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('accounting')
    .description('CLI-first headless accounting engine')
    .version('0.1.0');

  program.addCommand(createLedgerCommand());
  program.addCommand(createAccountsCommand());
  program.addCommand(createRawCommand());
  program.addCommand(createReconcileCommand());

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    process.stderr.write(`${error.name}: ${error.message}\n`);
  } else {
    process.stderr.write('Unknown error\n');
  }

  process.exit(1);
});
