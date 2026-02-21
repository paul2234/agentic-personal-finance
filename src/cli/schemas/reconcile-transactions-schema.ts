import { z } from 'zod';

const amountRegex = /^\d+(\.\d{1,4})?$/;

const reconciliationAllocationSchema = z.object({
  rawTransactionId: z.string().uuid(),
  amountApplied: z.string().regex(amountRegex, 'amountApplied must be a positive decimal string'),
});

const reconcileJournalLineSchema = z.object({
  accountCode: z.string().min(1),
  type: z.enum(['DEBIT', 'CREDIT']),
  amount: z.string().regex(amountRegex, 'amount must be a positive decimal string'),
  description: z.string().max(500).optional(),
});

export const reconcileTransactionsSchema = z.object({
  entryDate: z.string().date(),
  memo: z.string().max(1000).optional(),
  sourceType: z.string().max(100).optional(),
  sourceRef: z.string().max(200).optional(),
  createdBy: z.string().uuid().optional(),
  rawTransactionAllocations: z.array(reconciliationAllocationSchema).min(1),
  journalLines: z.array(reconcileJournalLineSchema).min(2),
});

export type ReconcileTransactionsPayload = z.infer<typeof reconcileTransactionsSchema>;
