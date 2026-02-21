import { createClient } from 'npm:@supabase/supabase-js@2';

interface ReconcilePayload {
  entryDate: string;
  memo?: string;
  sourceType?: string;
  sourceRef?: string;
  createdBy?: string;
  transactionAllocations: Array<{
    transactionId: string;
    amountApplied: string;
  }>;
  journalLines: Array<{
    accountCode: string;
    type: 'DEBIT' | 'CREDIT';
    amount: string;
    description?: string;
  }>;
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

function parsePayload(raw: unknown): ReconcilePayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const payload = raw as Partial<ReconcilePayload>;
  if (!payload.entryDate || typeof payload.entryDate !== 'string') {
    return null;
  }

  if (!Array.isArray(payload.transactionAllocations) || payload.transactionAllocations.length === 0) {
    return null;
  }

  if (!Array.isArray(payload.journalLines) || payload.journalLines.length < 2) {
    return null;
  }

  return payload as ReconcilePayload;
}

function parseRpcError(errorMessage: string): { code: string; message: string } {
  const separatorIndex = errorMessage.indexOf(':');
  if (separatorIndex <= 0) {
    return {
      code: 'INTERNAL_ERROR',
      message: errorMessage,
    };
  }

  const code = errorMessage.slice(0, separatorIndex).trim();
  const message = errorMessage.slice(separatorIndex + 1).trim();
  return { code, message };
}

function statusForCode(code: string): number {
  if (code === 'VALIDATION_ERROR' || code === 'UNBALANCED_ENTRY' || code === 'MISSING_ACCOUNT') {
    return 400;
  }

  if (
    code === 'RAW_TRANSACTION_NOT_FOUND'
    || code === 'TRANSACTION_NOT_FOUND'
    || code === 'ALREADY_FULLY_RECONCILED'
  ) {
    return 404;
  }

  if (code === 'OVER_ALLOCATED') {
    return 409;
  }

  return 500;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Only POST is supported.');
  }

  if (!isAuthorized(request)) {
    return errorResponse(401, 'UNAUTHORIZED', 'Missing or invalid bearer token');
  }

  const idempotencyKey = request.headers.get('Idempotency-Key');
  if (!idempotencyKey) {
    return errorResponse(400, 'IDEMPOTENCY_REQUIRED', 'Idempotency-Key header is required.');
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return errorResponse(400, 'VALIDATION_ERROR', 'Request body must be valid JSON.');
  }

  const payload = parsePayload(rawPayload);
  if (!payload) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Invalid reconciliation payload.');
  }

  try {
    const supabase = getServiceClient();
    const rpcAllocations = payload.transactionAllocations.map((allocation) => ({
      rawTransactionId: allocation.transactionId,
      amountApplied: allocation.amountApplied,
    }));
    const rpcResult = await supabase.rpc('reconcile_transactions', {
      p_entry_date: payload.entryDate,
      p_memo: payload.memo ?? null,
      p_source_type: payload.sourceType ?? 'reconciliation',
      p_source_ref: payload.sourceRef ?? idempotencyKey,
      p_created_by: payload.createdBy ?? null,
      p_journal_lines: payload.journalLines,
      p_raw_allocations: rpcAllocations,
    });

    if (rpcResult.error) {
      const parsed = parseRpcError(rpcResult.error.message);
      const normalizedCode = parsed.code === 'RAW_TRANSACTION_NOT_FOUND'
        ? 'TRANSACTION_NOT_FOUND'
        : parsed.code;
      return errorResponse(statusForCode(normalizedCode), normalizedCode, parsed.message);
    }

    const data = (rpcResult.data ?? {}) as {
      journalEntryId?: string;
      journalNumber?: string;
      allocationCount?: number;
      reconciledRawTransactionIds?: string[];
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          journalEntryId: data.journalEntryId,
          journalNumber: data.journalNumber,
          allocationCount: data.allocationCount,
          reconciledTransactionIds: data.reconciledRawTransactionIds ?? [],
        },
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return errorResponse(500, 'INTERNAL_ERROR', message);
  }
});
