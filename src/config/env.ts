import { config as loadDotEnv } from 'dotenv';

loadDotEnv();

export interface AppConfig {
  databaseUrl: string;
}

export function getConfig(): AppConfig {
  const databaseUrl: string | undefined = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL. Add it to your .env file.');
  }

  return {
    databaseUrl,
  };
}
