import { createClient } from 'npm:@supabase/supabase-js@2';

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
type NormalSide = 'DEBIT' | 'CREDIT';

interface CreateAccountPayload {
  code: string;
  name: string;
  accountType: AccountType;
  normalSide: NormalSide;
  allowContra?: boolean;
  createdBy?: string;
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

function parsePayload(raw: unknown): CreateAccountPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const payload = raw as Partial<CreateAccountPayload>;
  const validTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
  const validSides = ['DEBIT', 'CREDIT'];

  if (!payload.code || typeof payload.code !== 'string') {
    return null;
  }

  if (!payload.name || typeof payload.name !== 'string') {
    return null;
  }

  if (!payload.accountType || !validTypes.includes(payload.accountType)) {
    return null;
  }

  if (!payload.normalSide || !validSides.includes(payload.normalSide)) {
    return null;
  }

  return payload as CreateAccountPayload;
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
    return errorResponse(400, 'VALIDATION_ERROR', 'Invalid account payload.');
  }

  const expectedSide = EXPECTED_NORMAL_SIDE[payload.accountType];
  const isContra = expectedSide !== payload.normalSide;
  if (isContra && !payload.allowContra) {
    return errorResponse(
      400,
      'CONTRA_CONFIRMATION_REQUIRED',
      'Contra account requested. Re-run with allowContra=true (CLI: --allow-contra).',
      {
        accountType: payload.accountType,
        expectedNormalSide: expectedSide,
        providedNormalSide: payload.normalSide,
      },
    );
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .insert({
        code: payload.code,
        name: payload.name,
        account_type: payload.accountType,
        normal_side: payload.normalSide,
        is_active: true,
        created_by: payload.createdBy ?? null,
      })
      .select('id, code, name, account_type, normal_side, is_active')
      .single();

    if (error) {
      if (error.code === '23505') {
        return errorResponse(409, 'DUPLICATE_ACCOUNT_CODE', `Account code already exists: ${payload.code}`);
      }

      return errorResponse(500, 'INTERNAL_ERROR', error.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: data.id,
          code: data.code,
          name: data.name,
          accountType: data.account_type,
          normalSide: data.normal_side,
          isActive: data.is_active,
        },
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return errorResponse(500, 'INTERNAL_ERROR', message);
  }
});
