ALTER TABLE raw_transactions
  ADD COLUMN IF NOT EXISTS allocated_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reconciliation_status TEXT NOT NULL DEFAULT 'UNRECONCILED';

ALTER TABLE raw_transactions
  DROP CONSTRAINT IF EXISTS raw_transactions_reconciliation_status_check;

ALTER TABLE raw_transactions
  ADD CONSTRAINT raw_transactions_reconciliation_status_check
  CHECK (reconciliation_status IN ('UNRECONCILED', 'PARTIALLY_RECONCILED', 'FULLY_RECONCILED'));

ALTER TABLE raw_transactions
  DROP CONSTRAINT IF EXISTS raw_transactions_allocated_amount_non_negative;

ALTER TABLE raw_transactions
  ADD CONSTRAINT raw_transactions_allocated_amount_non_negative
  CHECK (allocated_amount >= 0);

CREATE TABLE IF NOT EXISTS raw_transaction_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_transaction_id UUID NOT NULL REFERENCES raw_transactions(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
  amount_applied NUMERIC(18, 4) NOT NULL CHECK (amount_applied > 0),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  UNIQUE (raw_transaction_id, journal_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_raw_transaction_allocations_raw_transaction_id
  ON raw_transaction_allocations(raw_transaction_id);

CREATE INDEX IF NOT EXISTS idx_raw_transaction_allocations_journal_entry_id
  ON raw_transaction_allocations(journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_raw_transactions_reconciliation_status_occurred_at
  ON raw_transactions(reconciliation_status, occurred_at);

CREATE OR REPLACE FUNCTION update_raw_transaction_reconciliation_state(
  p_raw_transaction_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  raw_amount_abs NUMERIC(18, 4);
  allocated_total NUMERIC(18, 4);
  next_status TEXT;
BEGIN
  SELECT ABS(amount)
  INTO raw_amount_abs
  FROM raw_transactions
  WHERE id = p_raw_transaction_id;

  IF raw_amount_abs IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount_applied), 0)
  INTO allocated_total
  FROM raw_transaction_allocations
  WHERE raw_transaction_id = p_raw_transaction_id;

  IF allocated_total = 0 THEN
    next_status := 'UNRECONCILED';
  ELSIF allocated_total < raw_amount_abs THEN
    next_status := 'PARTIALLY_RECONCILED';
  ELSE
    next_status := 'FULLY_RECONCILED';
  END IF;

  UPDATE raw_transactions
  SET
    allocated_amount = allocated_total,
    reconciliation_status = next_status,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_raw_transaction_id;
END;
$$;

CREATE OR REPLACE FUNCTION validate_raw_transaction_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  raw_amount_abs NUMERIC(18, 4);
  allocated_total NUMERIC(18, 4);
BEGIN
  SELECT ABS(amount)
  INTO raw_amount_abs
  FROM raw_transactions
  WHERE id = NEW.raw_transaction_id
  FOR UPDATE;

  IF raw_amount_abs IS NULL THEN
    RAISE EXCEPTION 'Raw transaction not found: %', NEW.raw_transaction_id;
  END IF;

  SELECT COALESCE(SUM(amount_applied), 0)
  INTO allocated_total
  FROM raw_transaction_allocations
  WHERE raw_transaction_id = NEW.raw_transaction_id
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  allocated_total := allocated_total + NEW.amount_applied;

  IF allocated_total > raw_amount_abs THEN
    RAISE EXCEPTION 'Allocation exceeds remaining amount for raw transaction %', NEW.raw_transaction_id
      USING ERRCODE = '23514',
        DETAIL = format('raw_amount_abs=%.4f allocated_total=%.4f', raw_amount_abs, allocated_total);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_raw_transaction_reconciliation_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM update_raw_transaction_reconciliation_state(OLD.raw_transaction_id);
    RETURN OLD;
  END IF;

  PERFORM update_raw_transaction_reconciliation_state(NEW.raw_transaction_id);

  IF TG_OP = 'UPDATE' AND NEW.raw_transaction_id <> OLD.raw_transaction_id THEN
    PERFORM update_raw_transaction_reconciliation_state(OLD.raw_transaction_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_raw_transaction_allocation ON raw_transaction_allocations;

CREATE TRIGGER trg_validate_raw_transaction_allocation
BEFORE INSERT OR UPDATE ON raw_transaction_allocations
FOR EACH ROW
EXECUTE FUNCTION validate_raw_transaction_allocation();

DROP TRIGGER IF EXISTS trg_sync_raw_transaction_reconciliation_state ON raw_transaction_allocations;

CREATE TRIGGER trg_sync_raw_transaction_reconciliation_state
AFTER INSERT OR UPDATE OR DELETE ON raw_transaction_allocations
FOR EACH ROW
EXECUTE FUNCTION sync_raw_transaction_reconciliation_state();

UPDATE raw_transactions
SET
  allocated_amount = 0,
  reconciliation_status = 'UNRECONCILED'
WHERE allocated_amount <> 0
   OR reconciliation_status <> 'UNRECONCILED';
