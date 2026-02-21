# Database Schema Reference (CLI-Aligned)

## Purpose

Provide a human-readable reference for the database model as reflected by the
current CLI input schemas in `src/cli/schemas/`.

## Scope and Source

- Source files:
  - `src/cli/schemas/create-account-schema.ts`
  - `src/cli/schemas/create-accounts-batch-schema.ts`
  - `src/cli/schemas/post-entry-schema.ts`
  - `src/cli/schemas/import-transactions-schema.ts`
  - `src/cli/schemas/reconcile-transactions-schema.ts`
- This document describes practical data shape and constraints used by the CLI.
- Some fields listed here are command payload fields that map to one or more DB
  columns at write time.

## Core Entities

### 1) Chart of Accounts

Represents account master data used by journal lines and imports.

Typical columns and constraints:

- `id` (UUID, primary key)
- `code` (string, required, max 20, unique)
- `name` (string, required, max 200)
- `account_type` (enum: `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`)
- `normal_side` (enum: `DEBIT`, `CREDIT`)
- `allow_contra` (boolean, optional)
- `created_by` (UUID, optional)
- Audit timestamps (`created_at`, `updated_at`)

CLI notes:

- Single and batch account creation both follow the same account-level rules.
- Batch payload can include `allowContraByDefault` as a command-level default.

### 2) Journal Entries (Header)

Represents the journal header for posted or reconciled entries.

Typical columns and constraints:

- `id` (UUID, primary key)
- `journal_number` (string, unique)
- `entry_date` (date, required)
- `memo` (string, optional)
- `source_type` (string, optional, max 100)
- `source_ref` (string, optional, max 200)
- `created_by` (UUID, optional)
- Audit timestamps (`created_at`, `updated_at`)

CLI notes:

- `post-entry` allows `memo` up to 500 chars.
- `reconcile-transactions` allows `memo` up to 1000 chars.
- If both commands write to the same `memo` column, DB length should support the
  larger expected value.

### 3) Journal Entry Lines (Fact)

Represents debit/credit lines under a journal header.

Typical columns and constraints:

- `id` (UUID, primary key)
- `journal_entry_id` (UUID, FK to `journal_entries.id`, required)
- `line_number` (integer, required, unique per journal)
- `account_id` (UUID, FK to chart of accounts, required)
- `type` (enum: `DEBIT`, `CREDIT`, required)
- `amount` (numeric/decimal, required, positive, scale up to 4)
- `description` (string, optional)

CLI notes:

- Payload uses `accountCode`; service layer resolves this to `account_id`.
- Amount format is decimal string with up to 4 decimal places.
- At least 2 lines are required per journal payload.

### 4) Raw Transactions (Imported Bank/External Facts)

Represents imported external transactions before or during reconciliation.

Typical columns and constraints:

- `id` (UUID, primary key)
- `source` (string, required, min 1, max 100)
- `account_id` (UUID, FK to chart of accounts, required)
- `external_id` (string, required)
- `occurred_at` (timestamp/datetime, required)
- `description` (string, optional, max 1000)
- `amount` (numeric/decimal, required, signed, scale up to 4)
- `currency_code` (string, required, length 3)
- `metadata` (JSON/object, optional)
- `file_name` (string, optional, max 255)
- `created_by` (UUID, optional)
- Audit timestamps (`created_at`, `updated_at`)

CLI notes:

- Payload uses `accountCode`; service layer resolves this to `account_id`.
- Amount allows negative and positive values for import flows.
- Import command accepts one or more transactions per request.

### 5) Raw Transaction Allocations (Reconciliation Bridge)

Represents how much of each raw transaction is matched to a journal entry.

Typical columns and constraints:

- `id` (UUID, primary key)
- `raw_transaction_id` (UUID, FK to `raw_transactions.id`, required)
- `journal_entry_id` (UUID, FK to `journal_entries.id`, required)
- `amount_applied` (numeric/decimal, required, positive, scale up to 4)
- `created_by` (UUID, optional)
- Audit timestamps (`created_at`, `updated_at`)

CLI notes:

- Reconciliation payload requires one or more allocations.
- Each allocation references a raw transaction UUID and amount to apply.

## Cross-Entity Rules and Invariants

- Dual-entry invariant: journal debits must equal journal credits.
- Journals are posted with at least two lines.
- Monetary values use decimal strings in CLI and should be stored as fixed
  precision numeric/decimal types in DB.
- UUID values are used for actor and entity references where provided.
- Account references in CLI are human-facing (`accountCode`) and should resolve
  to internal account keys before persistence.

## Suggested Indexes (Aligned with Current Usage)

- `journal_entries(entry_date)`
- `journal_entries(status, entry_date)`
- `journal_entry_lines(journal_entry_id)`
- `journal_entry_lines(account_id)`
- `raw_transactions(occurred_at)`
- `raw_transactions(source, occurred_at)`
- `raw_transaction_allocations(raw_transaction_id)`
- `raw_transaction_allocations(journal_entry_id)`

This reference is intentionally implementation-friendly rather than strictly
DDL-accurate. Treat SQL migrations as the source of truth for exact types and
constraints.
