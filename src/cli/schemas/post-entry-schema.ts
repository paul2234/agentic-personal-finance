import { z } from 'zod';

export const journalLineSchema = z.object({
  accountCode: z.string().min(1),
  type: z.enum(['DEBIT', 'CREDIT']),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Amount must be a positive decimal string'),
  description: z.string().optional(),
});

export const postEntrySchema = z.object({
  entryDate: z.string().date(),
  memo: z.string().max(500).optional(),
  createdBy: z.string().uuid().optional(),
  sourceType: z.string().max(100).optional(),
  sourceRef: z.string().max(200).optional(),
  lines: z.array(journalLineSchema).min(2),
});

export type PostEntryPayload = z.infer<typeof postEntrySchema>;
