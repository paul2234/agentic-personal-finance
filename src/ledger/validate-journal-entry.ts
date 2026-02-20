import Decimal from 'decimal.js';

import { UnbalancedEntryError } from '../domain/errors/accounting-error';
import type { JournalLineInput } from '../types/accounting';

export interface JournalTotals {
  debitTotal: string;
  creditTotal: string;
}

export function validateJournalEntry(lines: JournalLineInput[]): JournalTotals {
  const debitTotal: Decimal = lines
    .filter((line) => line.type === 'DEBIT')
    .reduce((sum, line) => sum.plus(new Decimal(line.amount)), new Decimal(0));

  const creditTotal: Decimal = lines
    .filter((line) => line.type === 'CREDIT')
    .reduce((sum, line) => sum.plus(new Decimal(line.amount)), new Decimal(0));

  if (!debitTotal.equals(creditTotal)) {
    throw new UnbalancedEntryError(debitTotal.toFixed(4), creditTotal.toFixed(4));
  }

  return {
    debitTotal: debitTotal.toFixed(4),
    creditTotal: creditTotal.toFixed(4),
  };
}
