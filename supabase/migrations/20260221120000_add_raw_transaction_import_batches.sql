CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  file_name TEXT,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

ALTER TABLE raw_transactions
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_raw_transactions_account_occurred_at
  ON raw_transactions(account_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_raw_transactions_import_batch_id
  ON raw_transactions(import_batch_id);

CREATE INDEX IF NOT EXISTS idx_import_batches_account_imported_at
  ON import_batches(account_id, imported_at);
