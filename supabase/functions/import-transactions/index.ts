import { createClient } from 'npm:@supabase/supabase-js@2';

interface ImportedTransactionInput {
  externalId: string;
  occurredAt: string;
  description?: string;
  amount: string;
  currencyCode: string;
  metadata?: Record<string, unknown>;
}

interface ImportTransactionsPayload {
  source: string;
  accountCode: string;
  fileName?: string;
  createdBy?: string;
  transactions: ImportedTransactionInput[];
}

interface AccountRow {
  id: string;
  code: string;
}

interface ImportBatchRow {
  id: string;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

function errorResponse(status: number, code: string, message: string, details?: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code,
        message,
        details,
      },
    }),
    { status, headers: JSON_HEADERS },
  );
}

function isAuthorized(request: Request): boolean {
  const expectedToken = Deno.env.get('ACCOUNTING_SERVICE_TOKEN');
  if (!expectedToken) {
    return true;
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.replace('Bearer ', '').trim();
  return token === expectedToken;
}

function getServiceClient(): ReturnType<typeof createClient> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function isValidAmount(value: string): boolean {
  return /^-?\d+(\.\d{1,4})?$/.test(value);
}

function parsePayload(input: unknown): ImportTransactionsPayload | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const payload = input as Partial<ImportTransactionsPayload>;
  if (!payload.source || typeof payload.source !== 'string') {
    return null;
  }

  if (!payload.accountCode || typeof payload.accountCode !== 'string') {
    return null;
  }

  if (!Array.isArray(payload.transactions) || payload.transactions.length === 0) {
    return null;
  }

  for (const transaction of payload.transactions) {
    if (!transaction.externalId || !transaction.occurredAt || !transaction.amount || !transaction.currencyCode) {
      return null;
    }

    if (!isValidAmount(transaction.amount)) {
      return null;
    }
  }

  return payload as ImportTransactionsPayload;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Only POST is supported.');
  }

  if (!isAuthorized(request)) {
    return errorResponse(401, 'UNAUTHORIZED', 'Missing or invalid bearer token');
  }

  let inputPayload: unknown;
  try {
    inputPayload = await request.json();
  } catch {
    return errorResponse(400, 'VALIDATION_ERROR', 'Request body must be valid JSON.');
  }

  const payload = parsePayload(inputPayload);
  if (!payload) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Invalid transaction import payload.');
  }

  try {
    const supabase = getServiceClient();

    const { data: accountData, error: accountError } = await supabase
      .from('chart_of_accounts')
      .select('id, code')
      .eq('code', payload.accountCode)
      .eq('is_active', true)
      .single();

    if (accountError || !accountData) {
      return errorResponse(400, 'MISSING_ACCOUNT', `Account code not found: ${payload.accountCode}`);
    }

    const account = accountData as AccountRow;
    const { data: batchData, error: batchError } = await supabase
      .from('import_batches')
      .insert({
        source: payload.source,
        account_id: account.id,
        file_name: payload.fileName ?? null,
        row_count: payload.transactions.length,
        created_by: payload.createdBy ?? null,
      })
      .select('id')
      .single();

    if (batchError || !batchData) {
      return errorResponse(500, 'INTERNAL_ERROR', batchError?.message ?? 'Failed to create import batch.');
    }

    const batch = batchData as ImportBatchRow;
    let insertedCount = 0;
    let duplicateCount = 0;

    for (const transaction of payload.transactions) {
      const { error } = await supabase.from('raw_transactions').insert({
        source: payload.source,
        external_id: transaction.externalId,
        occurred_at: transaction.occurredAt,
        description: transaction.description ?? null,
        amount: transaction.amount,
        currency_code: transaction.currencyCode.toUpperCase(),
        metadata: transaction.metadata ?? {},
        account_id: account.id,
        import_batch_id: batch.id,
        created_by: payload.createdBy ?? null,
      });

      if (error) {
        if (error.code === '23505') {
          duplicateCount += 1;
          continue;
        }

        return errorResponse(500, 'INTERNAL_ERROR', error.message);
      }

      insertedCount += 1;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          importBatchId: batch.id,
          accountId: account.id,
          attemptedCount: payload.transactions.length,
          insertedCount,
          duplicateCount,
        },
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return errorResponse(500, 'INTERNAL_ERROR', message);
  }
});
