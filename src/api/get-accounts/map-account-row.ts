export interface AccountRow {
  id: string;
  code: string;
  name: string;
  account_type: string;
  normal_side: 'DEBIT' | 'CREDIT';
  is_active: boolean;
}

export interface MappedAccount {
  id: string;
  code: string;
  name: string;
  accountType: string;
  normalSide: 'DEBIT' | 'CREDIT';
  isActive: boolean;
}

export function mapAccountRow(row: AccountRow): MappedAccount {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    accountType: row.account_type,
    normalSide: row.normal_side,
    isActive: row.is_active,
  };
}
