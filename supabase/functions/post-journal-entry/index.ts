import { createClient } from 'npm:@supabase/supabase-js@2';

import { validateBalanced } from './validate-balanced.ts';

interface JournalLineInput {
  accountCode: string;
  type: 'DEBIT' | 'CREDIT';
  amount: string;
  description?: string;
}

interface PostJournalEntryPayload {
  entryDate: string;
  memo?: string;
  createdBy?: string;
  sourceType?: string;
  sourceRef?: string;
  lines: JournalLineInput[];
}

interface AccountRow {
  id: string;
  code: string;
}

interface JournalHeaderRow {
  id: string;
  journal_number: string;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

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

function parsePayload(raw: unknown): PostJournalEntryPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const payload = raw as Partial<PostJournalEntryPayload>;
  if (!payload.entryDate || typeof payload.entryDate !== 'string') {
    return null;
  }

  if (!Array.isArray(payload.lines) || payload.lines.length < 2) {
    return null;
  }

  return payload as PostJournalEntryPayload;
}

function generateJournalNumber(): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `JRN-${yyyy}${mm}${dd}-${suffix}`;
}

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

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Only POST is supported.');
  }

  if (!isAuthorized(request)) {
    return errorResponse(401, 'UNAUTHORIZED', 'Missing or invalid bearer token');
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return errorResponse(400, 'VALIDATION_ERROR', 'Request body must be valid JSON.');
  }

  const payload = parsePayload(rawPayload);
  if (!payload) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Invalid journal entry payload.');
  }

  try {
    validateBalanced(payload.lines);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    try {
      const parsed = JSON.parse(message) as {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
      return errorResponse(400, parsed.code, parsed.message, parsed.details);
    } catch {
      return errorResponse(400, 'UNBALANCED_ENTRY', 'Entry is unbalanced.');
    }
  }

  try {
    const supabase = getServiceClient();

    const accountCodes = [...new Set(payload.lines.map((line) => line.accountCode))];
    const { data: accounts, error: accountError } = await supabase
      .from('chart_of_accounts')
      .select('id, code')
      .in('code', accountCodes)
      .eq('is_active', true);

    if (accountError) {
      return errorResponse(500, 'INTERNAL_ERROR', accountError.message);
    }

    const accountRows = (accounts ?? []) as AccountRow[];
    const accountByCode = new Map<string, string>(
      accountRows.map((account) => [account.code, account.id]),
    );

    const missingCodes = accountCodes.filter((code) => !accountByCode.has(code));
    if (missingCodes.length > 0) {
      return errorResponse(400, 'MISSING_ACCOUNT', 'One or more account codes were not found.', {
        missingAccountCodes: missingCodes,
      });
    }

    const journalNumber = generateJournalNumber();
    const { data: headerData, error: headerError } = await supabase
      .from('journal_entries')
      .insert({
        journal_number: journalNumber,
        entry_date: payload.entryDate,
        status: 'POSTED',
        memo: payload.memo ?? null,
        source_type: payload.sourceType ?? 'cli',
        source_ref: payload.sourceRef ?? null,
        created_by: payload.createdBy ?? null,
      })
      .select('id, journal_number')
      .single();

    if (headerError || !headerData) {
      return errorResponse(500, 'INTERNAL_ERROR', headerError?.message ?? 'Failed to create journal entry.');
    }

    const header = headerData as JournalHeaderRow;
    const lineRows = payload.lines.map((line, index) => ({
      journal_entry_id: header.id,
      line_number: index + 1,
      account_id: accountByCode.get(line.accountCode),
      line_type: line.type,
      amount: line.amount,
      currency_code: 'USD',
      description: line.description ?? null,
      created_by: payload.createdBy ?? null,
    }));

    const { error: lineError } = await supabase.from('journal_entry_lines').insert(lineRows);
    if (lineError) {
      return errorResponse(500, 'INTERNAL_ERROR', lineError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          journalEntryId: header.id,
          journalNumber: header.journal_number,
        },
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return errorResponse(500, 'INTERNAL_ERROR', message);
  }
});
