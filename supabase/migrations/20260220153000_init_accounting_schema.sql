CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  normal_side TEXT NOT NULL CHECK (normal_side IN ('DEBIT', 'CREDIT')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_number TEXT NOT NULL UNIQUE,
  entry_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED')),
  memo TEXT,
  source_type TEXT,
  source_ref TEXT,
  posted_at TIMESTAMP,
  posted_by UUID,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
  line_number INTEGER NOT NULL,
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  line_type TEXT NOT NULL CHECK (line_type IN ('DEBIT', 'CREDIT')),
  amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  UNIQUE (journal_entry_id, line_number)
);

CREATE TABLE IF NOT EXISTS raw_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  occurred_at TIMESTAMP NOT NULL,
  description TEXT,
  amount NUMERIC(18, 4) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date
  ON journal_entries(entry_date);

CREATE INDEX IF NOT EXISTS idx_journal_entries_status_entry_date
  ON journal_entries(status, entry_date);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_journal_entry_id
  ON journal_entry_lines(journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_id
  ON journal_entry_lines(account_id);

CREATE INDEX IF NOT EXISTS idx_raw_transactions_occurred_at
  ON raw_transactions(occurred_at);

CREATE INDEX IF NOT EXISTS idx_raw_transactions_source_occurred_at
  ON raw_transactions(source, occurred_at);

CREATE INDEX IF NOT EXISTS idx_raw_transactions_unmatched_occurred_at
  ON raw_transactions(occurred_at)
  WHERE journal_entry_id IS NULL;

INSERT INTO chart_of_accounts (code, name, account_type, normal_side)
VALUES
  ('1000', 'Cash Checking', 'ASSET', 'DEBIT'),
  ('1010', 'Cash Savings', 'ASSET', 'DEBIT'),
  ('1020', 'Credit Card Clearing', 'LIABILITY', 'CREDIT'),
  ('1100', 'Emergency Fund', 'ASSET', 'DEBIT'),
  ('1200', 'Retirement Account', 'ASSET', 'DEBIT'),
  ('1300', 'Brokerage Investments', 'ASSET', 'DEBIT'),
  ('1400', 'Home Value', 'ASSET', 'DEBIT'),
  ('2000', 'Credit Card Payable', 'LIABILITY', 'CREDIT'),
  ('2100', 'Mortgage Payable', 'LIABILITY', 'CREDIT'),
  ('2200', 'Auto Loan Payable', 'LIABILITY', 'CREDIT'),
  ('3000', 'Household Equity', 'EQUITY', 'CREDIT'),
  ('4000', 'Salary Income', 'REVENUE', 'CREDIT'),
  ('4010', 'Interest Income', 'REVENUE', 'CREDIT'),
  ('4020', 'Other Income', 'REVENUE', 'CREDIT'),
  ('5000', 'Housing Expense', 'EXPENSE', 'DEBIT'),
  ('5100', 'Utilities Expense', 'EXPENSE', 'DEBIT'),
  ('5200', 'Grocery Expense', 'EXPENSE', 'DEBIT'),
  ('5300', 'Transportation Expense', 'EXPENSE', 'DEBIT'),
  ('5400', 'Insurance Expense', 'EXPENSE', 'DEBIT'),
  ('5500', 'Healthcare Expense', 'EXPENSE', 'DEBIT'),
  ('5600', 'Education and Childcare Expense', 'EXPENSE', 'DEBIT'),
  ('5700', 'Entertainment Expense', 'EXPENSE', 'DEBIT'),
  ('5800', 'Misc Household Expense', 'EXPENSE', 'DEBIT')
ON CONFLICT (code) DO NOTHING;
