export class AccountingError extends Error {
  public readonly code: string;

  public readonly statusCode: number;

  public readonly details?: Record<string, unknown>;

  public constructor(
    message: string,
    code: string,
    statusCode: number = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AccountingError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class UnbalancedEntryError extends AccountingError {
  public constructor(debitTotal: string, creditTotal: string) {
    super(
      `Entry is unbalanced: debits ${debitTotal} != credits ${creditTotal}`,
      'UNBALANCED_ENTRY',
      400,
      { debitTotal, creditTotal },
    );
    this.name = 'UnbalancedEntryError';
  }
}

export class MissingAccountError extends AccountingError {
  public constructor(accountCode: string) {
    super(`Account code not found: ${accountCode}`, 'MISSING_ACCOUNT', 400, {
      accountCode,
    });
    this.name = 'MissingAccountError';
  }
}
