export type AccountId = string & { readonly __brand: 'AccountId' };
export type JournalEntryId = string & { readonly __brand: 'JournalEntryId' };

export type EntryLineType = 'DEBIT' | 'CREDIT';

export interface JournalLineInput {
  accountCode: string;
  type: EntryLineType;
  amount: string;
  description?: string;
}

export interface PostJournalEntryInput {
  entryDate: string;
  memo?: string;
  createdBy?: string;
  sourceType?: string;
  sourceRef?: string;
  lines: JournalLineInput[];
}

export interface PostedJournalResult {
  journalEntryId: JournalEntryId;
  journalNumber: string;
}

export interface AccountListItem {
  id: string;
  code: string;
  name: string;
  accountType: string;
  normalSide: 'DEBIT' | 'CREDIT';
  isActive: boolean;
}

export interface RawTransactionInput {
  externalId: string;
  occurredAt: string;
  description?: string;
  amount: string;
  currencyCode: string;
  metadata?: Record<string, unknown>;
}

export interface ImportRawTransactionsInput {
  source: string;
  accountCode: string;
  fileName?: string;
  createdBy?: string;
  transactions: RawTransactionInput[];
}

export interface ImportRawTransactionsResult {
  importBatchId: string;
  accountId: string;
  attemptedCount: number;
  insertedCount: number;
  duplicateCount: number;
}
