# Reconciliation Contract V1

## Purpose

Define the reconciliation API/CLI contract before implementation.

Reconciliation means:

1. create a balanced journal entry
2. allocate one or more raw transactions to that journal

## Canonical Amount Rule

`raw_transactions.amount` uses account perspective:

- Positive = imported account balance increases
- Negative = imported account balance decreases

All reconciliation logic uses this canonical value.

## CLI Commands (V1)

- `reconcile post --file <path> [--json]`
- `reconcile list-unmatched [--account-code <code>] [--limit <n>] [--json]`
- `reconcile show --raw-transaction-id <id> [--json]`

## Edge Endpoints (V1)

- `POST /reconcile-transactions`
- `GET /list-unmatched-raw-transactions`
- `GET /get-raw-transaction-reconciliation?rawTransactionId=<uuid>`

## Shared Response Envelope

Success:

```json
{
  "success": true,
  "data": {}
}
```

## Idempotency

- `POST /reconcile-transactions` requires `Idempotency-Key` header.
- Same key + same payload returns original success response.
- Same key + different payload returns `IDEMPOTENCY_CONFLICT`.

Failure:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

## POST /reconcile-transactions

Creates a journal and allocation records in one operation.

### Request Body

```json
{
  "entryDate": "2026-02-22",
  "memo": "Reconcile checking outflow",
  "sourceType": "reconciliation",
  "sourceRef": "raw-import-2026-02",
  "rawTransactionAllocations": [
    {
      "rawTransactionId": "c5d32db2-f3f4-4319-9a52-2918ca2a4fbb",
      "amountApplied": "1500.00"
    }
  ],
  "journalLines": [
    {
      "accountCode": "5200",
      "type": "DEBIT",
      "amount": "1200.00",
      "description": "Mortgage interest"
    },
    {
      "accountCode": "2100",
      "type": "DEBIT",
      "amount": "300.00",
      "description": "Mortgage principal"
    },
    {
      "accountCode": "1000",
      "type": "CREDIT",
      "amount": "1500.00",
      "description": "Checking payment"
    }
  ]
}
```

### Rules

- `journalLines` must be balanced (total debit = total credit)
- each `journalLines[].amount` must be positive; direction is encoded by `type` (`DEBIT`/`CREDIT`)
- `rawTransactionAllocations` must have at least one row
- each `rawTransactionAllocations[].amountApplied` must be positive (absolute magnitude)
- `amountApplied` cannot over-allocate any raw transaction
- allocation invariant per raw transaction:
  - `sum(amountApplied) <= abs(raw_transactions.amount)`
  - equal means fully reconciled
  - lower means partially reconciled
- same raw transaction can be partially allocated across multiple journals over time
- posted journals remain immutable; reversals are separate entries

### Success Response

```json
{
  "success": true,
  "data": {
    "journalEntryId": "4f9929ee-5fb9-4ff8-86ac-af3f1af40f6e",
    "journalNumber": "JRN-20260222-6F724F18",
    "allocationCount": 1,
    "reconciledRawTransactionIds": [
      "c5d32db2-f3f4-4319-9a52-2918ca2a4fbb"
    ]
  }
}
```

## GET /list-unmatched-raw-transactions

Returns raw transactions that are not fully reconciled.

### Query Params

- `accountCode` (optional)
- `limit` (optional, default 100)

### Success Response

```json
{
  "success": true,
  "data": [
    {
      "rawTransactionId": "c5d32db2-f3f4-4319-9a52-2918ca2a4fbb",
      "accountCode": "1000",
      "occurredAt": "2026-02-20T12:45:00Z",
      "amount": "-1500.00",
      "allocatedAmount": "-500.00",
      "remainingAmount": "-1000.00",
      "status": "PARTIALLY_RECONCILED",
      "description": "Mortgage payment"
    }
  ]
}
```

## GET /get-raw-transaction-reconciliation

Returns reconciliation detail for one raw transaction.

### Query Params

- `rawTransactionId` (required)

### Success Response

```json
{
  "success": true,
  "data": {
    "rawTransaction": {
      "id": "c5d32db2-f3f4-4319-9a52-2918ca2a4fbb",
      "accountCode": "1000",
      "amount": "-1500.00",
      "allocatedAmount": "-500.00",
      "remainingAmount": "-1000.00",
      "status": "PARTIALLY_RECONCILED"
    },
    "allocations": [
      {
        "allocationId": "1a812272-85f8-4df2-8a9b-7e9f342f6412",
        "journalEntryId": "9b77e89d-97f5-4db9-89a1-fcf44d5e2d69",
        "journalNumber": "JRN-20260220-2A8F4F1C",
        "amountApplied": "-500.00",
        "createdAt": "2026-02-21T10:00:00Z"
      }
    ]
  }
}
```

## Error Codes (V1)

- `VALIDATION_ERROR`
- `UNBALANCED_ENTRY`
- `MISSING_ACCOUNT`
- `RAW_TRANSACTION_NOT_FOUND`
- `OVER_ALLOCATED`
- `ALREADY_FULLY_RECONCILED`
- `IDEMPOTENCY_REQUIRED`
- `IDEMPOTENCY_CONFLICT`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `INTERNAL_ERROR`

## Anchor Scenarios

### Happy Paths

- Reconcile one raw transaction with one balancing line pair
- Reconcile one raw transaction split into multiple expense/liability lines
- Reconcile multiple raw transactions into one journal (for transfer/payoff patterns)

### Edge Cases

- Reject unbalanced journal
- Reject allocation that exceeds remaining amount
- Allow partial reconciliation and keep remaining amount available
- Reject references to unknown raw transaction IDs

## Notes for Phased Delivery

- `V1.0` (MVP): single-raw reconciliation + split journal lines, with `POST /reconcile-transactions`.
- `V1.1`: multi-raw reconciliation in one journal entry.
- Read endpoints can be delivered in parallel with `V1.0` or immediately after.
