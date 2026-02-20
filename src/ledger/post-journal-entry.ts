import { JournalRepository } from '../db/repositories/journal-repository';
import type { PostJournalEntryInput, PostedJournalResult } from '../types/accounting';

import { validateJournalEntry } from './validate-journal-entry';

export class LedgerService {
  private readonly journalRepository: JournalRepository;

  public constructor(journalRepository?: JournalRepository) {
    this.journalRepository = journalRepository ?? new JournalRepository();
  }

  public async postEntry(input: PostJournalEntryInput): Promise<PostedJournalResult> {
    validateJournalEntry(input.lines);

    return this.journalRepository.createJournalEntry(input);
  }
}
