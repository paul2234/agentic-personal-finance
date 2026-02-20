import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import { withTransaction } from '../client';
import { MissingAccountError } from '../../domain/errors/accounting-error';
import type { JournalLineInput, PostedJournalResult } from '../../types/accounting';

interface JournalHeaderRow {
  id: string;
  journal_number: string;
}

export interface CreateJournalEntryInput {
  entryDate: string;
  memo?: string;
  createdBy?: string;
  sourceType?: string;
  sourceRef?: string;
  lines: JournalLineInput[];
}

export class JournalRepository {
  public async createJournalEntry(input: CreateJournalEntryInput): Promise<PostedJournalResult> {
    return withTransaction(async (client: PoolClient): Promise<PostedJournalResult> => {
      const journalNumber: string = this.generateJournalNumber();
      const header = await client.query<JournalHeaderRow>(
        `
          INSERT INTO journal_entries (
            journal_number,
            entry_date,
            status,
            memo,
            source_type,
            source_ref,
            created_by
          )
          VALUES ($1, $2, 'POSTED', $3, $4, $5, $6)
          RETURNING id, journal_number
        `,
        [
          journalNumber,
          input.entryDate,
          input.memo ?? null,
          input.sourceType ?? null,
          input.sourceRef ?? null,
          input.createdBy ?? null,
        ],
      );

      const journalEntryId: string = header.rows[0].id;

      for (const [index, line] of input.lines.entries()) {
        const accountId: string = await this.findAccountIdOrThrow(client, line.accountCode);
        await client.query(
          `
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
            VALUES ($1, $2, $3, $4, $5, 'USD', $6, $7)
          `,
          [
            journalEntryId,
            index + 1,
            accountId,
            line.type,
            line.amount,
            line.description ?? null,
            input.createdBy ?? null,
          ],
        );
      }

      return {
        journalEntryId: journalEntryId as PostedJournalResult['journalEntryId'],
        journalNumber: header.rows[0].journal_number,
      };
    });
  }

  private generateJournalNumber(): string {
    const now: Date = new Date();
    const yyyy: string = String(now.getUTCFullYear());
    const mm: string = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd: string = String(now.getUTCDate()).padStart(2, '0');
    const suffix: string = randomUUID().slice(0, 8).toUpperCase();

    return `JRN-${yyyy}${mm}${dd}-${suffix}`;
  }

  private async findAccountIdOrThrow(client: PoolClient, accountCode: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      `
        SELECT id
        FROM chart_of_accounts
        WHERE code = $1
          AND is_active = true
        LIMIT 1
      `,
      [accountCode],
    );

    const accountId: string | undefined = result.rows[0]?.id;
    if (!accountId) {
      throw new MissingAccountError(accountCode);
    }

    return accountId;
  }
}
