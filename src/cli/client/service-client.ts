import type { AccountListItem } from '../../types/accounting';
import type { CreateAccountsBatchInput, CreateAccountsBatchResult } from '../../types/accounting';
import type { CreateAccountInput, CreatedAccountResult } from '../../types/accounting';
import type { ImportRawTransactionsInput, ImportRawTransactionsResult } from '../../types/accounting';
import type { PostJournalEntryInput, PostedJournalResult } from '../../types/accounting';
import type { ApiResponse } from '../../types/api';

const DEFAULT_SERVICE_URL = 'http://127.0.0.1:54321/functions/v1';

export class ServiceClient {
  private readonly baseUrl: string;

  private readonly bearerToken?: string;

  public constructor(baseUrl?: string, bearerToken?: string) {
    this.baseUrl = baseUrl ?? process.env.ACCOUNTING_SERVICE_URL ?? DEFAULT_SERVICE_URL;
    this.bearerToken = bearerToken ?? process.env.ACCOUNTING_SERVICE_TOKEN;
  }

  public async listAccounts(): Promise<AccountListItem[]> {
    const response = await fetch(`${this.baseUrl}/get-accounts`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    return this.unwrapApiResponse<AccountListItem[]>(response);
  }

  public async createAccount(input: CreateAccountInput): Promise<CreatedAccountResult> {
    const response = await fetch(`${this.baseUrl}/create-account`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(input),
    });

    return this.unwrapApiResponse<CreatedAccountResult>(response);
  }

  public async createAccountsBatch(
    input: CreateAccountsBatchInput,
  ): Promise<CreateAccountsBatchResult> {
    const response = await fetch(`${this.baseUrl}/create-accounts-batch`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(input),
    });

    return this.unwrapApiResponse<CreateAccountsBatchResult>(response);
  }

  public async postJournalEntry(input: PostJournalEntryInput): Promise<PostedJournalResult> {
    const response = await fetch(`${this.baseUrl}/post-journal-entry`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(input),
    });

    return this.unwrapApiResponse<PostedJournalResult>(response);
  }

  public async importRawTransactions(
    input: ImportRawTransactionsInput,
  ): Promise<ImportRawTransactionsResult> {
    const response = await fetch(`${this.baseUrl}/import-raw-transactions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(input),
    });

    return this.unwrapApiResponse<ImportRawTransactionsResult>(response);
  }

  private async unwrapApiResponse<T>(response: Response): Promise<T> {
    const payload = await this.readJsonResponse<unknown>(response);

    if (!this.isApiResponse(payload)) {
      if (!response.ok) {
        throw new Error(`Service request failed with status ${response.status}.`);
      }

      throw new Error('Service response did not match expected envelope.');
    }

    if (!payload.success) {
      throw new Error(payload.error.message);
    }

    return payload.data as T;
  }

  private async readJsonResponse<T>(response: Response): Promise<T> {
    const bodyText: string = await response.text();

    try {
      return JSON.parse(bodyText) as T;
    } catch {
      if (!response.ok) {
        throw new Error(`Service request failed with status ${response.status}.`);
      }

      throw new Error('Service response was not valid JSON.');
    }
  }

  private getHeaders(): HeadersInit {
    if (!this.bearerToken) {
      return {
        'Content-Type': 'application/json',
      };
    }

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.bearerToken}`,
    };
  }

  private isApiResponse(payload: unknown): payload is ApiResponse<unknown> {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const candidate = payload as Partial<ApiResponse<unknown>>;
    return typeof candidate.success === 'boolean';
  }
}
