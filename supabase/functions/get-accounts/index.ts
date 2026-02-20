import { createClient } from 'npm:@supabase/supabase-js@2';

import { mapAccountRow, type AccountRow } from '../../../src/api/get-accounts/map-account-row.ts';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

function getServiceClient(): ReturnType<typeof createClient> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(supabaseUrl, serviceRoleKey);
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

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Only GET is supported.',
        },
      }),
      { status: 405, headers: JSON_HEADERS },
    );
  }

  if (!isAuthorized(request)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid bearer token',
        },
      }),
      { status: 401, headers: JSON_HEADERS },
    );
  }

  try {
    const supabase = getServiceClient();
    const query = supabase
      .from('chart_of_accounts')
      .select('id, code, name, account_type, normal_side, is_active')
      .order('code', { ascending: true });
    const { data, error } = await query;

    if (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error.message,
          },
        }),
        { status: 500, headers: JSON_HEADERS },
      );
    }

    const accounts = (data ?? []).map((row: AccountRow) => mapAccountRow(row));

    return new Response(
      JSON.stringify({
        success: true,
        data: accounts,
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message,
        },
      }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
});
