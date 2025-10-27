const getEnv = (key: string, required = true): string | undefined => {
  const value = process.env[key];
  if (!value && required) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const AWS_REGION = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'eu-south-1';
export const STAGE = getEnv('STAGE') as string;
export const ASSIGNMENTS_BUCKET = getEnv('ASSIGNMENTS_BUCKET') as string;
export const ASSIGNMENTS_TABLE = getEnv('ASSIGNMENTS_TABLE') as string;
export const COURSES_TABLE = getEnv('COURSES_TABLE') as string;
export const SES_SOURCE_EMAIL = getEnv('SES_SOURCE_EMAIL', false);
export const SECRETS_PREFIX = getEnv('SECRETS_PREFIX', false);
export const ARCHIVE_QUEUE_URL = getEnv('ARCHIVE_QUEUE_URL') as string;

export const ADMIN_USER_POOL_ID = getEnv('ADMIN_USER_POOL_ID', false);
export const ADMIN_USER_POOL_CLIENT_ID = getEnv('ADMIN_USER_POOL_CLIENT_ID', false);
export const ADMIN_USER_POOL_REGION = getEnv('ADMIN_USER_POOL_REGION', false) ?? AWS_REGION;
export const ADMIN_USER_POOL_AUDIENCE =
  getEnv('ADMIN_USER_POOL_AUDIENCE', false) ?? ADMIN_USER_POOL_CLIENT_ID ?? undefined;

export const ensureOptionalEnv = (key: string): string | undefined => getEnv(key, false);
