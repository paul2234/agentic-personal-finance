# Reconciliation Implementation Plan

## Purpose

Provide a step-by-step implementation path for transaction reconciliation in a CLI-first flow using Edge Functions and a relational ledger schema.

## Guiding Decisions

- Canonical sign rule: `raw_transactions.amount` uses account perspective.
  - Positive means the imported account balance increases.
  - Negative means the imported account balance decreases.
- Reconciliation is modeled as posting balanced journal entries plus explicit allocations from imported transactions.
- API/service contracts are finalized before schema and code changes.

## Phase 1 - Contracts and Scope

1. Create reconciliation contract document (`docs/contracts/reconciliation-v1.md`):
   - endpoint definitions
   - request/response envelopes
   - error codes
   - payload examples (single transaction, split transaction, multi-raw)
2. Confirm MVP scope:
   - single transaction reconciliation with split lines
3. Confirm follow-up scope:
   - multi-transaction reconciliation in one journal

## Phase 2 - Import Normalization Baseline

1. Define import profile behavior for source/account sign and field mapping.
2. Normalize source values into canonical `raw_transactions.amount` at ingest.
3. Preserve source fidelity in metadata (`raw_amount`, source row payload, parse info).
4. Return import summaries with inserted/duplicate/failed counts.

## Phase 3 - Schema Extensions for Reconciliation

1. Add allocation table (`raw_transaction_allocations`):
   - `id` UUID
   - `raw_transaction_id` FK
   - `journal_entry_id` FK
   - `amount_applied` numeric(18,4)
   - audit columns
2. Add reconciliation status support (stored or derived):
   - `unreconciled`, `partially_reconciled`, `fully_reconciled`
3. Add indexes for key access paths:
   - allocations by `raw_transaction_id`
   - allocations by `journal_entry_id`
   - unmatched/partially matched transaction queries

## Phase 4 - Core Reconciliation Service Logic

1. Validate reconciliation request:
   - referenced transactions exist
   - selected balancing accounts exist and are active
2. Validate balancing:
   - journal lines satisfy debit equals credit
3. Validate allocation constraints:
   - no over-allocation
   - no duplicate/conflicting allocations
4. Persist atomically:
   - create journal header and lines
   - create allocation rows
   - update/derive reconciliation state

## Phase 5 - MVP Delivery (Single Raw + Splits)

1. Edge Function endpoint:
   - `POST /reconcile-transactions`
2. CLI command:
   - `reconcile post --file <payload.json> [--json]`
3. Capability delivered:
   - one raw transaction can be split across multiple balancing lines in one journal

## Phase 6 - Multi-Raw Reconciliation

1. Extend request to include multiple raw transaction IDs.
2. Support posting one journal that reconciles multiple raw rows.
3. Enforce aggregate allocation and balancing checks.

## Phase 7 - Reconciliation Query/Review UX

1. Edge Function read endpoints:
   - list unmatched/partially reconciled transactions
   - show reconciliation details for one raw transaction
2. CLI commands:
   - `reconcile list-unmatched`
   - `reconcile show --transaction-id <id>`

## Phase 8 - Test Strategy

1. Unit tests:
   - sign normalization
   - split allocation math
   - over-allocation checks
2. Integration tests:
   - endpoint behavior with DB
   - state transitions and error paths
3. E2E tests:
   - CLI -> Edge Function -> DB reconciliation flows
4. Test gating:
   - keep edge-backed tests behind `RUN_EDGE_E2E=1`

## Phase 9 - Documentation and Operational Readiness

1. Update README with reconciliation command examples and payloads.
2. Document import-normalization expectations and troubleshooting.
3. Add migration and local-run checklist for contributors.

## Suggested File Locations

- Planning docs: `docs/plans/`
- API/behavior contracts: `docs/contracts/`

This plan is intentionally high level and should be paired with the detailed reconciliation contract before implementation starts.
