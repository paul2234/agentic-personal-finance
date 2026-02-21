import { z } from 'zod';

const importedTransactionSchema = z.object({
  externalId: z.string().min(1),
  occurredAt: z.string().datetime(),
  description: z.string().max(1000).optional(),
  amount: z.string().regex(/^-?\d+(\.\d{1,4})?$/, 'Amount must be a decimal string'),
  currencyCode: z.string().length(3),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const importTransactionsSchema = z.object({
  source: z.string().min(1).max(100),
  accountCode: z.string().min(1).max(20),
  fileName: z.string().max(255).optional(),
  createdBy: z.string().uuid().optional(),
  transactions: z.array(importedTransactionSchema).min(1),
});

export type ImportTransactionsPayload = z.infer<typeof importTransactionsSchema>;
