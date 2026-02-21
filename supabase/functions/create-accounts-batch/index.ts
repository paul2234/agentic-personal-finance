import { createClient } from 'npm:@supabase/supabase-js@2';

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
type NormalSide = 'DEBIT' | 'CREDIT';

interface AccountInput {
  code: string;
  name: string;
  accountType: AccountType;
  normalSide: NormalSide;
  allowContra?: boolean;
}

interface CreateAccountsBatchPayload {
  createdBy?: string;
  allowContraByDefault?: boolean;
  accounts: AccountInput[];
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

const EXPECTED_NORMAL_SIDE: Record<AccountType, NormalSide> = {
  ASSET: 'DEBIT',
  EXPENSE: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  REVENUE: 'CREDIT',
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

function parsePayload(raw: unknown): CreateAccountsBatchPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const payload = raw as Partial<CreateAccountsBatchPayload>;
  const validTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
  const validSides = ['DEBIT', 'CREDIT'];

  if (!Array.isArray(payload.accounts) || payload.accounts.length === 0) {
    return null;
  }

  for (const account of payload.accounts) {
    if (!account || typeof account !== 'object') {
      return null;
    }

    if (!account.code || !account.name || !account.accountType || !account.normalSide) {
      return null;
    }

    if (!validTypes.includes(account.accountType) || !validSides.includes(account.normalSide)) {
      return null;
    }
  }

  return payload as CreateAccountsBatchPayload;
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
    return errorResponse(400, 'VALIDATION_ERROR', 'Invalid create-accounts-batch payload.');
  }

  try {
    const supabase = getServiceClient();
    const created = [] as Array<{
      id: string;
      code: string;
      name: string;
      accountType: string;
      normalSide: 'DEBIT' | 'CREDIT';
      isActive: boolean;
    }>;
    const errors = [] as Array<{ code: string; accountCode: string; message: string }>;

    let duplicateCount = 0;
    let contraRejectedCount = 0;

    for (const account of payload.accounts) {
      const expectedSide = EXPECTED_NORMAL_SIDE[account.accountType];
      const isContra = expectedSide !== account.normalSide;
      const allowContra = Boolean(account.allowContra) || Boolean(payload.allowContraByDefault);

      if (isContra && !allowContra) {
        contraRejectedCount += 1;
        errors.push({
          code: 'CONTRA_CONFIRMATION_REQUIRED',
          accountCode: account.code,
          message: `Contra account requires allowContra for code ${account.code}`,
        });
        continue;
      }

      const { data, error } = await supabase
        .from('chart_of_accounts')
        .insert({
          code: account.code,
          name: account.name,
          account_type: account.accountType,
          normal_side: account.normalSide,
          is_active: true,
          created_by: payload.createdBy ?? null,
        })
        .select('id, code, name, account_type, normal_side, is_active')
        .single();

      if (error) {
        if (error.code === '23505') {
          duplicateCount += 1;
          errors.push({
            code: 'DUPLICATE_ACCOUNT_CODE',
            accountCode: account.code,
            message: `Account code already exists: ${account.code}`,
          });
          continue;
        }

        errors.push({
          code: 'INTERNAL_ERROR',
          accountCode: account.code,
          message: error.message,
        });
        continue;
      }

      created.push({
        id: data.id,
        code: data.code,
        name: data.name,
        accountType: data.account_type,
        normalSide: data.normal_side,
        isActive: data.is_active,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          attemptedCount: payload.accounts.length,
          createdCount: created.length,
          duplicateCount,
          contraRejectedCount,
          created,
          errors,
        },
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return errorResponse(500, 'INTERNAL_ERROR', message);
  }
});
