CREATE OR REPLACE FUNCTION reconcile_transactions(
  p_entry_date DATE,
  p_memo TEXT,
  p_source_type TEXT,
  p_source_ref TEXT,
  p_created_by UUID,
  p_journal_lines JSONB,
  p_raw_allocations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_journal_entry_id UUID;
  v_journal_number TEXT;
  v_line JSONB;
  v_alloc JSONB;
  v_line_number INTEGER := 0;
  v_account_id UUID;
  v_raw_id UUID;
  v_amount NUMERIC(18, 4);
  v_amount_applied NUMERIC(18, 4);
  v_line_type TEXT;
  v_debits NUMERIC(18, 4) := 0;
  v_credits NUMERIC(18, 4) := 0;
  v_allocation_count INTEGER := 0;
  v_missing_accounts TEXT[] := ARRAY[]::TEXT[];
  v_missing_raw UUID[] := ARRAY[]::UUID[];
  v_reconciled_raw_ids UUID[] := ARRAY[]::UUID[];
  v_raw_abs NUMERIC(18, 4);
  v_allocated_so_far NUMERIC(18, 4);
BEGIN
  IF p_journal_lines IS NULL OR jsonb_typeof(p_journal_lines) <> 'array' OR jsonb_array_length(p_journal_lines) = 0 THEN
    RAISE EXCEPTION '%', 'VALIDATION_ERROR:journalLines must be a non-empty array';
  END IF;

  IF p_raw_allocations IS NULL OR jsonb_typeof(p_raw_allocations) <> 'array' OR jsonb_array_length(p_raw_allocations) = 0 THEN
    RAISE EXCEPTION '%', 'VALIDATION_ERROR:rawTransactionAllocations must be a non-empty array';
  END IF;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_raw_allocations) LOOP
    BEGIN
      v_raw_id := (v_alloc->>'rawTransactionId')::UUID;
      v_amount_applied := (v_alloc->>'amountApplied')::NUMERIC(18, 4);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION '%', 'VALIDATION_ERROR:Invalid raw allocation payload';
    END;

    IF v_raw_id IS NULL OR v_amount_applied IS NULL OR v_amount_applied <= 0 THEN
      RAISE EXCEPTION '%', 'VALIDATION_ERROR:Invalid raw allocation payload';
    END IF;

    SELECT ABS(amount), allocated_amount
    INTO v_raw_abs, v_allocated_so_far
    FROM raw_transactions
    WHERE id = v_raw_id
    FOR UPDATE;

    IF v_raw_abs IS NULL THEN
      v_missing_raw := array_append(v_missing_raw, v_raw_id);
      CONTINUE;
    END IF;

    IF v_allocated_so_far >= v_raw_abs THEN
      RAISE EXCEPTION '%', format('ALREADY_FULLY_RECONCILED:%s', v_raw_id::TEXT);
    END IF;

    IF v_allocated_so_far + v_amount_applied > v_raw_abs THEN
      RAISE EXCEPTION '%', format('OVER_ALLOCATED:%s', v_raw_id::TEXT);
    END IF;
  END LOOP;

  IF array_length(v_missing_raw, 1) IS NOT NULL THEN
    RAISE EXCEPTION '%', format('RAW_TRANSACTION_NOT_FOUND:%s', array_to_string(v_missing_raw, ','));
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_journal_lines) LOOP
    BEGIN
      v_amount := (v_line->>'amount')::NUMERIC(18, 4);
      v_line_type := UPPER(v_line->>'type');
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION '%', 'VALIDATION_ERROR:Invalid journal line payload';
    END;

    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION '%', 'VALIDATION_ERROR:Journal line amount must be > 0';
    END IF;

    IF v_line_type NOT IN ('DEBIT', 'CREDIT') THEN
      RAISE EXCEPTION '%', 'VALIDATION_ERROR:Journal line type must be DEBIT or CREDIT';
    END IF;

    SELECT id
    INTO v_account_id
    FROM chart_of_accounts
    WHERE code = (v_line->>'accountCode')
      AND is_active = true
    LIMIT 1;

    IF v_account_id IS NULL THEN
      v_missing_accounts := array_append(v_missing_accounts, (v_line->>'accountCode'));
    END IF;

    IF v_line_type = 'DEBIT' THEN
      v_debits := v_debits + v_amount;
    ELSE
      v_credits := v_credits + v_amount;
    END IF;
  END LOOP;

  IF array_length(v_missing_accounts, 1) IS NOT NULL THEN
    RAISE EXCEPTION '%', format('MISSING_ACCOUNT:%s', array_to_string(v_missing_accounts, ','));
  END IF;

  IF v_debits <> v_credits THEN
    RAISE EXCEPTION '%', format('UNBALANCED_ENTRY:debits %s != credits %s', v_debits, v_credits);
  END IF;

  v_journal_number := 'JRN-'
    || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD')
    || '-'
    || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 8));

  INSERT INTO journal_entries (
    journal_number,
    entry_date,
    status,
    memo,
    source_type,
    source_ref,
    created_by
  )
  VALUES (
    v_journal_number,
    p_entry_date,
    'POSTED',
    p_memo,
    COALESCE(p_source_type, 'reconciliation'),
    p_source_ref,
    p_created_by
  )
  RETURNING id INTO v_journal_entry_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_journal_lines) LOOP
    v_line_number := v_line_number + 1;

    SELECT id
    INTO v_account_id
    FROM chart_of_accounts
    WHERE code = (v_line->>'accountCode')
      AND is_active = true
    LIMIT 1;

    INSERT INTO journal_entry_lines (
      journal_entry_id,
      line_number,
      account_id,
      line_type,
      amount,
      currency_code,
      description,
      created_by
    )
    VALUES (
      v_journal_entry_id,
      v_line_number,
      v_account_id,
      UPPER(v_line->>'type'),
      (v_line->>'amount')::NUMERIC(18, 4),
      'USD',
      v_line->>'description',
      p_created_by
    );
  END LOOP;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_raw_allocations) LOOP
    v_raw_id := (v_alloc->>'rawTransactionId')::UUID;
    v_amount_applied := (v_alloc->>'amountApplied')::NUMERIC(18, 4);

    INSERT INTO raw_transaction_allocations (
      raw_transaction_id,
      journal_entry_id,
      amount_applied,
      created_by
    )
    VALUES (
      v_raw_id,
      v_journal_entry_id,
      v_amount_applied,
      p_created_by
    );

    v_allocation_count := v_allocation_count + 1;
    v_reconciled_raw_ids := array_append(v_reconciled_raw_ids, v_raw_id);
  END LOOP;

  RETURN jsonb_build_object(
    'journalEntryId', v_journal_entry_id,
    'journalNumber', v_journal_number,
    'allocationCount', v_allocation_count,
    'reconciledRawTransactionIds', v_reconciled_raw_ids
  );
END;
$$;
