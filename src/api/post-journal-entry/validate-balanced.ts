export interface JournalLineForValidation {
  type: 'DEBIT' | 'CREDIT';
  amount: string;
}

export interface JournalTotals {
  debitTotal: string;
  creditTotal: string;
}

function toScaledAmount(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(normalized)) {
    throw new Error(`Invalid amount format: ${value}`);
  }

  const [wholePart, fractionalPart = ''] = normalized.split('.');
  const paddedFraction = fractionalPart.padEnd(4, '0');
  return BigInt(wholePart) * 10000n + BigInt(paddedFraction);
}

function toDecimalString(value: bigint): string {
  const whole = value / 10000n;
  const fraction = (value % 10000n).toString().padStart(4, '0');
  return `${whole.toString()}.${fraction}`;
}

export function validateBalanced(lines: JournalLineForValidation[]): JournalTotals {
  const debitTotal = lines
    .filter((line) => line.type === 'DEBIT')
    .reduce((sum, line) => sum + toScaledAmount(line.amount), 0n);

  const creditTotal = lines
    .filter((line) => line.type === 'CREDIT')
    .reduce((sum, line) => sum + toScaledAmount(line.amount), 0n);

  if (debitTotal !== creditTotal) {
    throw new Error(
      JSON.stringify({
        code: 'UNBALANCED_ENTRY',
        message: `Entry is unbalanced: debits ${toDecimalString(debitTotal)} != credits ${toDecimalString(creditTotal)}`,
        details: {
          debitTotal: toDecimalString(debitTotal),
          creditTotal: toDecimalString(creditTotal),
        },
      }),
    );
  }

  return {
    debitTotal: toDecimalString(debitTotal),
    creditTotal: toDecimalString(creditTotal),
  };
}
