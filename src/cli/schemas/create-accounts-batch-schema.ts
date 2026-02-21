import { z } from 'zod';

import { createAccountSchema } from './create-account-schema';

export const createAccountsBatchSchema = z.object({
  createdBy: z.string().uuid().optional(),
  allowContraByDefault: z.boolean().optional(),
  accounts: z.array(createAccountSchema.omit({ createdBy: true })).min(1),
});

export type CreateAccountsBatchPayload = z.infer<typeof createAccountsBatchSchema>;
