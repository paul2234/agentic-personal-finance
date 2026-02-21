import { z } from 'zod';

export const createAccountSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  accountType: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  normalSide: z.enum(['DEBIT', 'CREDIT']),
  allowContra: z.boolean().optional(),
  createdBy: z.string().uuid().optional(),
});

export type CreateAccountPayload = z.infer<typeof createAccountSchema>;
