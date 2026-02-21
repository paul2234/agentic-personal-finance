# Agentic Accounting

CLI-first headless accounting engine with dual-entry ledger rules and Supabase-managed schema migrations.

## CLI Usage

Start the local edge function in one terminal:

```bash
npm run service:dev
```

Human-readable:

```bash
npm run dev -- accounts list
```

Machine-readable:

```bash
npm run dev -- accounts list --json
```

Create a new account:

```bash
npm run dev -- accounts create --code 1500 --name "Prepaid Expense" --type ASSET --normal-side DEBIT
```

Create a contra account (explicit confirmation):

```bash
npm run dev -- accounts create --code 1590 --name "Accumulated Depreciation" --type ASSET --normal-side CREDIT --allow-contra
```

Create accounts from a JSON file:

```bash
npm run dev -- accounts create --from-file ./examples/accounts-batch.json --allow-contra
```

Post a journal entry from file:

```bash
npm run dev -- ledger post-entry --file ./examples/journal-entry.json
```

Import transactions from file:

```bash
npm run dev -- transactions import --file ./examples/transactions-import.json
```

Post a reconciliation payload from file:

```bash
npm run dev -- reconcile post --file ./examples/reconcile-transaction.json --json
```

## Example Journal Payload

```json
{
  "entryDate": "2026-02-20",
  "memo": "Initial sale",
  "lines": [
    { "accountCode": "1000", "type": "DEBIT", "amount": "100.00" },
    { "accountCode": "4000", "type": "CREDIT", "amount": "100.00" }
  ]
}
```

## Example Transaction Import Payload

```json
{
  "source": "bank-csv",
  "accountCode": "1000",
  "fileName": "checking-2026-02.csv",
  "transactions": [
    {
      "externalId": "txn-2026-02-001",
      "occurredAt": "2026-02-18T15:11:00Z",
      "description": "Payroll Deposit",
      "amount": "2500.00",
      "currencyCode": "USD"
    }
  ]
}
```

## Quality Checks

```bash
npm run typecheck
npm run lint
npm test
```

## Local Development Setup

### Prerequisites

- Node.js 20+
- Docker (for local Supabase stack)
- Supabase CLI

### Setup Steps

1. Install dependencies:

```bash
npm install
```

2. Start local Supabase stack:

```bash
supabase start
```

3. Copy environment variables:

```bash
cp .env.example .env
```

4. Apply migrations:

```bash
npm run db:migrate
```
