# AGENTS.md - Headless Accounting Engine

## Project Overview

A headless accounting engine with a dual-entry ledger, designed to run end-to-end from a CLI interface. Core architecture uses a relational database with fact and dimension tables.

## Build/Lint/Test Commands

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build

# Run all tests
npm test

# Run a single test file
npm test -- path/to/test.spec.ts

# Run tests matching a pattern
npm test -- --grep "pattern"

# Run tests in watch mode
npm test -- --watch

# Linting
npm run lint

# Lint with auto-fix
npm run lint:fix

# Type checking
npm run typecheck

# Database migrations
npm run db:migrate
npm run db:rollback
npm run db:seed
```

## Code Style Guidelines

### File Organization

```
src/
  cli/              # CLI commands and command handlers
  api/              # Optional REST API routes/controllers (non-primary interface)
  domain/           # Business logic and domain models
  ledger/           # Dual-entry ledger core
  db/               # Database layer (repositories, migrations)
  types/            # TypeScript type definitions
  utils/            # Shared utilities
  config/           # Configuration management
tests/
  unit/             # Unit tests mirror src/ structure
  integration/      # API and database integration tests
```

### Imports

Order imports in the following groups, separated by blank lines:
1. Node.js built-in modules
2. External dependencies
3. Internal modules (use path aliases)
4. Relative imports

```typescript
import { randomUUID } from 'node:crypto';

import express from 'express';
import { z } from 'zod';

import { LedgerService } from '@/ledger/service';
import { AccountRepository } from '@/db/repositories/account';

import { validateRequest } from './middleware';
```

### Formatting

- Use 2-space indentation
- Maximum line length: 100 characters
- Use single quotes for strings
- Trailing commas in multiline structures
- Semicolons required
- Prefer `const` over `let`; never use `var`

### TypeScript Types

- Explicit return types on all exported functions
- Use `interface` for object shapes, `type` for unions/intersections
- Avoid `any`; use `unknown` when type is truly unknown
- Use branded types for domain identifiers

```typescript
// Branded types for type-safe IDs
type AccountId = string & { readonly __brand: 'AccountId' };
type TransactionId = string & { readonly __brand: 'TransactionId' };
type EntryId = string & { readonly __brand: 'EntryId' };

// Domain interfaces
interface Account {
  id: AccountId;
  code: string;
  name: string;
  type: AccountType;
  currency: Currency;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `ledger-service.ts` |
| Classes | PascalCase | `LedgerService` |
| Interfaces | PascalCase | `JournalEntry` |
| Functions | camelCase | `postTransaction` |
| Constants | SCREAMING_SNAKE | `MAX_RETRY_COUNT` |
| Database tables | snake_case | `journal_entries` |
| API endpoints | kebab-case | `/api/v1/journal-entries` |

### Error Handling

Use custom error classes with error codes for API responses:

```typescript
class AccountingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AccountingError';
  }
}

// Specific error types
class UnbalancedEntryError extends AccountingError {
  constructor(debitTotal: Decimal, creditTotal: Decimal) {
    super(
      `Entry is unbalanced: debits ${debitTotal} != credits ${creditTotal}`,
      'UNBALANCED_ENTRY',
      400,
      { debitTotal: debitTotal.toString(), creditTotal: creditTotal.toString() },
    );
  }
}
```

### Dual-Entry Ledger Rules

1. **Every transaction must balance**: Sum of debits MUST equal sum of credits
2. **Immutability**: Never update or delete posted entries; use reversing entries
3. **Audit trail**: All operations must be traceable with timestamps and user IDs
4. **Decimal precision**: Use `Decimal.js` or similar for monetary calculations; never use floats

```typescript
// Entry validation
function validateJournalEntry(entries: LedgerEntry[]): void {
  const debits = entries
    .filter(e => e.type === 'DEBIT')
    .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));
  
  const credits = entries
    .filter(e => e.type === 'CREDIT')
    .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));
  
  if (!debits.equals(credits)) {
    throw new UnbalancedEntryError(debits, credits);
  }
}
```

### Database Schema Conventions

Core accounting schema (starting point):
- `chart_of_accounts` (dimension) - account master (`code`, `name`, `account_type`, `normal_side`)
- `journal_entries` (header) - one row per journal (`journal_number`, `entry_date`, `status`)
- `journal_entry_lines` (fact) - one row per debit/credit line, FK to `journal_entries`
- `raw_transactions` (fact) - imported external/bank transactions for reconciliation

Journal modeling requirements:
- Use a header/lines model (`journal_entries` + `journal_entry_lines`) to support multi-line journals
- Enforce unique journal identity (`journal_entries.id` UUID and `journal_number` unique)
- Enforce per-line sequencing (`UNIQUE (journal_entry_id, line_number)`)
- Store money as fixed precision numeric/decimal, never float
- Posting must happen in a DB transaction and reject unbalanced journals

Indexing requirements (minimum):
- `journal_entries(entry_date)`
- `journal_entries(status, entry_date)`
- `journal_entry_lines(journal_entry_id)`
- `journal_entry_lines(account_id)`
- `raw_transactions(occurred_at)`
- `raw_transactions(source, occurred_at)` when source-scoped date queries are common
- Partial index for reconciliation queues: `raw_transactions(occurred_at) WHERE journal_entry_id IS NULL`

```sql
-- All tables must have these audit columns
created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
created_by UUID REFERENCES users(id),
```

### Database Migration Workflow (Supabase)

- Treat SQL migrations as the source of truth; do not rely on one-off dashboard edits
- Create a new migration file with `supabase migration new <name>`
- Author explicit SQL in the generated migration file (tables, constraints, indexes, RLS/policies)
- Apply pending migrations with `supabase db push`
- Commit migration files so schema changes are reproducible across environments
- Use `supabase db diff -f <name>` only when you intentionally want to generate SQL from local DB drift/prototyping

### API Design

- Use REST conventions with versioned endpoints (`/api/v1/...`)
- Return consistent response envelopes
- Use HTTP status codes correctly
- Validate all inputs with Zod schemas

```typescript
// Response envelope
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}
```

### Testing Guidelines

- Unit tests for all business logic
- Integration tests for API endpoints and database operations
- Use factories for test data generation
- Test the dual-entry invariant explicitly

```typescript
describe('LedgerService', () => {
  it('rejects unbalanced journal entries', async () => {
    const entries = [
      { accountId, type: 'DEBIT', amount: '100.00' },
      { accountId, type: 'CREDIT', amount: '99.99' },
    ];
    
    await expect(ledgerService.postEntry(entries))
      .rejects.toThrow(UnbalancedEntryError);
  });
});
```

### CLI Design

- CLI is the primary interface for all accounting workflows
- Implement commands with clear verb-noun names (e.g., `ledger post-entry`, `accounts list`)
- Support both human-readable output and machine-readable output (e.g., `--json`)
- Validate command inputs before executing domain logic
- Return non-zero exit codes for failures and include actionable error messages
- Keep command handlers thin; delegate accounting rules to `domain/` and `ledger/`

### Security Considerations

- Never log sensitive financial data
- Validate all monetary amounts server-side
- Use parameterized queries exclusively
- Implement rate limiting on all endpoints
- Require authentication for all operations
